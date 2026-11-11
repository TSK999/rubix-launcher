//! SQLite is the authority for local library and measured play sessions.
use anyhow::{Context, Result};
use rubix_core::{Discovery, Game, Installation, Provider, now_unix};
use sqlx::{
    Row, SqlitePool,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions},
};
use std::{path::Path, time::Duration};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct Database {
    pool: SqlitePool,
}

impl Database {
    pub async fn open(path: &Path) -> Result<Self> {
        let options = SqliteConnectOptions::new()
            .filename(path)
            .create_if_missing(true)
            .foreign_keys(true)
            .journal_mode(SqliteJournalMode::Wal)
            .busy_timeout(Duration::from_secs(5));
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await
            .context("Could not open Rubix's local database")?;
        sqlx::migrate!("../../migrations")
            .run(&pool)
            .await
            .context("Database migration failed; existing data has been preserved")?;
        // Never add wall-clock time after a crash. Only previously measured checkpoints count.
        sqlx::query("UPDATE sessions SET ended_at = checkpoint_at, outcome = 'interrupted' WHERE ended_at IS NULL").execute(&pool).await?;
        Ok(Self { pool })
    }
    pub async fn integrity_check(&self) -> Result<String> {
        Ok(sqlx::query_scalar::<_, String>("PRAGMA integrity_check")
            .fetch_one(&self.pool)
            .await?)
    }
    /// One transaction for a scan: failures cannot leave half-imported games.
    pub async fn import(&self, discoveries: &[Discovery]) -> Result<usize> {
        let mut tx = self.pool.begin().await?;
        for game in discoveries {
            game.target
                .validate()
                .context("Invalid launch target in discovered game")?;
            anyhow::ensure!(
                !game.title.trim().is_empty() && game.title.len() <= 512,
                "Invalid game title"
            );
            anyhow::ensure!(
                !game.external_id.is_empty() && game.external_id.len() <= 4096,
                "Invalid game identity"
            );
            let existing: Option<String> = sqlx::query_scalar(
                "SELECT game_id FROM installations WHERE provider = ? AND external_id = ?",
            )
            .bind(game.provider.key())
            .bind(&game.external_id)
            .fetch_optional(&mut *tx)
            .await?;
            let game_id = if let Some(id) = existing {
                id
            } else {
                let same_install: Option<String> = sqlx::query_scalar(
                    "SELECT game_id FROM installations WHERE merge_key = ? LIMIT 1",
                )
                .bind(game.merge_key())
                .fetch_optional(&mut *tx)
                .await?;
                same_install.unwrap_or_else(|| game.stable_id())
            };
            sqlx::query("INSERT OR IGNORE INTO games(id, title, cover) VALUES (?, ?, ?)")
                .bind(&game_id)
                .bind(&game.title)
                .bind(
                    game.cover
                        .as_ref()
                        .map(|x| x.to_string_lossy().into_owned()),
                )
                .execute(&mut *tx)
                .await?;
            sqlx::query("UPDATE games SET cover = COALESCE(cover, ?) WHERE id = ?")
                .bind(
                    game.cover
                        .as_ref()
                        .map(|x| x.to_string_lossy().into_owned()),
                )
                .bind(&game_id)
                .execute(&mut *tx)
                .await?;
            sqlx::query("INSERT INTO installations(id, game_id, provider, external_id, merge_key, directory, target) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(provider, external_id) DO UPDATE SET merge_key = excluded.merge_key, directory = excluded.directory, target = excluded.target")
                .bind(game.stable_id()).bind(&game_id).bind(game.provider.key()).bind(&game.external_id).bind(game.merge_key()).bind(game.install_directory.to_string_lossy().as_ref()).bind(serde_json::to_string(&game.target)?).execute(&mut *tx).await?;
        }
        tx.commit().await?;
        Ok(discoveries.len())
    }
    pub async fn games(&self) -> Result<Vec<Game>> {
        let rows = sqlx::query("SELECT g.*, COALESCE((SELECT SUM(elapsed_seconds) FROM sessions WHERE game_id = g.id), 0) AS playtime, (SELECT MAX(started_at) FROM sessions WHERE game_id = g.id) AS last_played FROM games g ORDER BY title COLLATE NOCASE").fetch_all(&self.pool).await?;
        let installs = sqlx::query("SELECT * FROM installations ORDER BY provider, external_id")
            .fetch_all(&self.pool)
            .await?;
        let mut grouped: std::collections::HashMap<String, Vec<Installation>> =
            std::collections::HashMap::new();
        for install in installs {
            let game_id: String = install.try_get("game_id")?;
            let directory = std::path::PathBuf::from(install.try_get::<String, _>("directory")?);
            let target: rubix_core::LaunchTarget =
                serde_json::from_str(&install.try_get::<String, _>("target")?)?;
            let available = match &target {
                rubix_core::LaunchTarget::Executable { path, .. } => path.is_file(),
                _ => directory.is_dir(),
            };
            let provider = match install.try_get::<String, _>("provider")?.as_str() {
                "steam" => Provider::Steam,
                "epic" => Provider::Epic,
                "manual" => Provider::Manual,
                other => anyhow::bail!("Unknown stored provider: {other}"),
            };
            grouped.entry(game_id).or_default().push(Installation {
                id: install.try_get("id")?,
                provider,
                install_directory: directory,
                target,
                available,
            });
        }
        let mut result = Vec::with_capacity(rows.len());
        for row in rows {
            let id: String = row.try_get("id")?;
            let installations = grouped.remove(&id).unwrap_or_default();
            result.push(Game {
                id,
                title: row.try_get("title")?,
                favorite: row.try_get("favorite")?,
                hidden: row.try_get("hidden")?,
                collections: serde_json::from_str(&row.try_get::<String, _>("collections")?)?,
                cover: row.try_get::<Option<String>, _>("cover")?.map(Into::into),
                installations,
                total_seconds: row.try_get::<i64, _>("playtime")?.max(0) as u64,
                last_played: row.try_get("last_played")?,
            });
        }
        Ok(result)
    }
    pub async fn set_flags(&self, id: &str, favorite: bool, hidden: bool) -> Result<()> {
        sqlx::query("UPDATE games SET favorite = ?, hidden = ? WHERE id = ?")
            .bind(favorite)
            .bind(hidden)
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
    pub async fn set_metadata(
        &self,
        id: &str,
        title: &str,
        collections: &[String],
        cover: Option<&Path>,
    ) -> Result<()> {
        anyhow::ensure!(
            !title.trim().is_empty() && title.len() <= 512,
            "Enter a game title"
        );
        sqlx::query(
            "UPDATE games SET title = ?, collections = ?, cover = COALESCE(?, cover) WHERE id = ?",
        )
        .bind(title.trim())
        .bind(serde_json::to_string(collections)?)
        .bind(cover.map(|p| p.to_string_lossy().into_owned()))
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }
    /// Only removes database entries. No path from a game record is deleted.
    pub async fn remove_game(&self, id: &str) -> Result<()> {
        sqlx::query("DELETE FROM games WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
    pub async fn begin_session(&self, game_id: &str) -> Result<String> {
        let id = Uuid::new_v4().to_string();
        let now = now_unix();
        sqlx::query(
            "INSERT INTO sessions(id, game_id, started_at, checkpoint_at) VALUES (?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(game_id)
        .bind(now)
        .bind(now)
        .execute(&self.pool)
        .await?;
        Ok(id)
    }
    pub async fn checkpoint(&self, id: &str, elapsed: u64, outcome: Option<&str>) -> Result<()> {
        let now = now_unix();
        sqlx::query("UPDATE sessions SET elapsed_seconds = MAX(elapsed_seconds, ?), checkpoint_at = ?, ended_at = ?, outcome = ? WHERE id = ? AND ended_at IS NULL")
            .bind(elapsed.min(i64::MAX as u64) as i64).bind(now).bind(outcome.map(|_| now)).bind(outcome.unwrap_or("running")).bind(id).execute(&self.pool).await?;
        Ok(())
    }
    pub async fn close(&self) {
        self.pool.close().await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rubix_core::{LaunchTarget, Provider};
    fn seed(dir: &Path, external_id: &str) -> Discovery {
        Discovery {
            provider: Provider::Steam,
            external_id: external_id.into(),
            title: "Fixture game".into(),
            install_directory: dir.into(),
            target: LaunchTarget::Steam { app_id: 220 },
            cover: None,
        }
    }
    #[tokio::test]
    async fn migrations_deduplication_and_launch_alternatives() {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(&dir.path().join("library.db"))
            .await
            .unwrap();
        let a = seed(dir.path(), "220");
        let mut b = seed(dir.path(), "epic-hl2");
        b.provider = Provider::Epic;
        b.target = LaunchTarget::Epic {
            app_name: "epic-hl2".into(),
        };
        db.import(&[a.clone(), b]).await.unwrap();
        db.import(&[a]).await.unwrap();
        let games = db.games().await.unwrap();
        assert_eq!(games.len(), 1);
        assert_eq!(games[0].installations.len(), 2);
        assert_eq!(db.integrity_check().await.unwrap(), "ok");
        db.remove_game(&games[0].id).await.unwrap();
        assert!(dir.path().is_dir());
        assert!(db.games().await.unwrap().is_empty());
    }
    #[tokio::test]
    async fn interrupted_sessions_use_checkpoints_and_invalid_import_rolls_back() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("library.db");
        let db = Database::open(&path).await.unwrap();
        let a = seed(dir.path(), "220");
        let mut bad = a.clone();
        bad.title.clear();
        assert!(db.import(&[a.clone(), bad]).await.is_err());
        assert!(db.games().await.unwrap().is_empty());
        db.import(std::slice::from_ref(&a)).await.unwrap();
        let session = db.begin_session(&a.stable_id()).await.unwrap();
        db.checkpoint(&session, 17, None).await.unwrap();
        db.close().await;
        let reopened = Database::open(&path).await.unwrap();
        reopened.checkpoint(&session, 999, None).await.unwrap();
        assert_eq!(reopened.games().await.unwrap()[0].total_seconds, 17);
    }
}
