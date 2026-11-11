//! Application services for discovery, user-selected artwork, and local search.
use anyhow::{Context, Result};
use rubix_core::{DataPaths, Discovery, Game, LaunchTarget, Provider, Settings, Sort, path_key};
use rubix_database::Database;
use std::path::{Path, PathBuf};

#[derive(Debug)]
pub struct Refresh {
    pub games: Vec<Game>,
    pub warnings: Vec<String>,
    pub discovered: usize,
    pub checked_roots: usize,
}

pub async fn refresh(db: &Database, settings: Settings, artwork: PathBuf) -> Result<Refresh> {
    let report = tokio::task::spawn_blocking(move || rubix_providers::scan(&settings)).await?;
    // Decode serially on a worker: bounded memory and no decoding on the UI thread.
    let report = tokio::task::spawn_blocking(move || {
        let mut report = report;
        for game in &mut report.games {
            if let Some(source) = game.cover.take() {
                game.cover = cache_cover(&source, &artwork, &game.stable_id()).ok();
            }
        }
        report
    })
    .await?;
    // Preserve provider warnings independently of artwork processing.
    let discovered = report.games.len();
    db.import(&report.games).await?;
    Ok(Refresh {
        games: db.games().await?,
        warnings: report.warnings,
        discovered,
        checked_roots: report.checked_roots,
    })
}

pub fn cache_cover(source: &Path, cache: &Path, id: &str) -> Result<PathBuf> {
    if source.parent() == Some(cache) {
        return Ok(source.into());
    }
    let metadata = source.metadata()?;
    let cache_key = format!(
        "{}:{}:{}",
        path_key(source),
        metadata.len(),
        metadata
            .modified()?
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    );
    let revision = uuid::Uuid::new_v5(&uuid::Uuid::NAMESPACE_URL, cache_key.as_bytes());
    let destination = cache.join(format!("{id}-{revision}.png"));
    if destination.is_file() {
        return Ok(destination);
    }
    anyhow::ensure!(
        source.metadata()?.len() <= 20 * 1024 * 1024,
        "Cover artwork exceeds 20 MiB"
    );
    let mut reader = image::ImageReader::open(source)?.with_guessed_format()?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(8192);
    limits.max_image_height = Some(8192);
    limits.max_alloc = Some(128 * 1024 * 1024);
    reader.limits(limits);
    let img = reader
        .decode()
        .context("The selected artwork is not a supported image")?
        .thumbnail(480, 720);
    std::fs::create_dir_all(cache)?;
    let mut temp = tempfile::NamedTempFile::new_in(cache)?;
    img.write_to(temp.as_file_mut(), image::ImageFormat::Png)?;
    temp.as_file().sync_all()?;
    temp.persist(&destination).map_err(|e| e.error)?;
    Ok(destination)
}

pub async fn add_manual(
    db: &Database,
    paths: &DataPaths,
    title: String,
    path: PathBuf,
    arguments: Vec<String>,
    directory: Option<PathBuf>,
    cover: Option<PathBuf>,
) -> Result<()> {
    let exe = path
        .canonicalize()
        .context("The selected executable does not exist")?;
    let mut game = Discovery {
        provider: Provider::Manual,
        external_id: path_key(&exe),
        title,
        install_directory: exe
            .parent()
            .context("Executable has no parent folder")?
            .into(),
        target: LaunchTarget::Executable {
            path: exe,
            arguments,
            working_directory: directory,
        },
        cover: None,
    };
    game.target.validate()?;
    if let Some(source) = cover {
        let cache = paths.artwork.clone();
        let id = game.stable_id();
        game.cover =
            Some(tokio::task::spawn_blocking(move || cache_cover(&source, &cache, &id)).await??);
    }
    db.import(&[game]).await?;
    Ok(())
}

pub fn matches_query(title: &str, query: &str) -> bool {
    let title = title.to_lowercase();
    let query = query.trim().to_lowercase();
    if query.is_empty() || title.contains(&query) {
        return true;
    }
    query.split_whitespace().all(|needle| {
        let mut letters = needle.chars();
        let mut next = letters.next();
        for c in title.chars() {
            if Some(c) == next {
                next = letters.next();
                if next.is_none() {
                    return true;
                }
            }
        }
        title
            .split_whitespace()
            .any(|word| edit_distance_at_most_one(word, needle))
    })
}

fn edit_distance_at_most_one(a: &str, b: &str) -> bool {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    if a.len().abs_diff(b.len()) > 1 {
        return false;
    }
    let (mut i, mut j, mut edits) = (0, 0, 0);
    while i < a.len() && j < b.len() {
        if a[i] == b[j] {
            i += 1;
            j += 1;
            continue;
        }
        edits += 1;
        if edits > 1 {
            return false;
        }
        if a.len() >= b.len() {
            i += 1;
        }
        if b.len() >= a.len() {
            j += 1;
        }
    }
    edits + usize::from(i < a.len() || j < b.len()) <= 1
}

pub fn sort_games(games: &mut [&Game], sort: Sort) {
    games.sort_by(|a, b| match sort {
        Sort::Title => a.title.to_lowercase().cmp(&b.title.to_lowercase()),
        Sort::RecentlyPlayed => b
            .last_played
            .cmp(&a.last_played)
            .then_with(|| a.title.cmp(&b.title)),
        Sort::Playtime => b
            .total_seconds
            .cmp(&a.total_seconds)
            .then_with(|| a.title.cmp(&b.title)),
    });
}

pub async fn refresh_owned(db: Database, settings: Settings, artwork: PathBuf) -> Result<Refresh> {
    refresh(&db, settings, artwork).await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fuzzy_search_handles_gaps_and_one_character_typos() {
        assert!(matches_query("Kerbal Space Program", "ksp"));
        assert!(matches_query("Minecraft Java Edition", "minecraf"));
        assert!(matches_query("Steam", "steem"));
        assert!(!matches_query("Kerbal Space Program", "valorant"));
    }
}
