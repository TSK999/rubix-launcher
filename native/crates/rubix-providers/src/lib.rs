//! Read-only provider adapters. No account passwords and no storefront web APIs.
mod vdf;
use anyhow::{Context, Result};
use rubix_core::{Discovery, LaunchTarget, Provider, Settings, path_key};
use serde::Deserialize;
use std::{
    collections::BTreeSet,
    fs,
    path::{Path, PathBuf},
};

#[derive(Debug, Default)]
pub struct ScanReport {
    pub games: Vec<Discovery>,
    pub warnings: Vec<String>,
    pub checked_roots: usize,
}

pub trait LibraryProvider {
    fn scan(&self) -> ScanReport;
}

pub struct Steam {
    pub roots: Vec<PathBuf>,
}
pub struct Epic {
    pub manifest_roots: Vec<PathBuf>,
}

fn bounded_read(path: &Path) -> Result<String> {
    anyhow::ensure!(
        fs::metadata(path)?.len() <= 2 * 1024 * 1024,
        "Manifest exceeds 2 MiB: {}",
        path.display()
    );
    Ok(fs::read_to_string(path)?)
}

fn safe_install_name(name: &str) -> bool {
    !name.is_empty() && name != "." && name != ".." && !name.contains(['/', '\\', ':', '\0'])
}

impl LibraryProvider for Steam {
    fn scan(&self) -> ScanReport {
        let mut report = ScanReport::default();
        let mut libraries = BTreeSet::new();
        for root in &self.roots {
            if !root.is_dir() {
                continue;
            }
            libraries.insert(root.clone());
            let folders = root.join("steamapps/libraryfolders.vdf");
            if !folders.is_file() {
                continue;
            }
            match bounded_read(&folders).and_then(|s| vdf::parse(&s)) {
                Ok(v) => {
                    if let Some(entries) = v.get("libraryfolders").and_then(vdf::Value::object) {
                        for (key, value) in entries {
                            if key.parse::<u32>().is_err() {
                                continue;
                            }
                            if let Some(path) =
                                value.text().or_else(|| value.object()?.get("path")?.text())
                            {
                                let p = PathBuf::from(path);
                                if p.is_absolute() {
                                    libraries.insert(p);
                                }
                            }
                        }
                    }
                }
                Err(e) => report.warnings.push(format!("{}: {e}", folders.display())),
            }
        }
        let mut seen = BTreeSet::new();
        for root in libraries {
            if !seen.insert(path_key(&root)) {
                continue;
            }
            report.checked_roots += 1;
            let entries = match fs::read_dir(root.join("steamapps")) {
                Ok(v) => v,
                Err(e) => {
                    report
                        .warnings
                        .push(format!("Steam library {}: {e}", root.display()));
                    continue;
                }
            };
            for file in entries.flatten() {
                let path = file.path();
                let name = file.file_name().to_string_lossy().into_owned();
                if !name.starts_with("appmanifest_") || !name.ends_with(".acf") {
                    continue;
                }
                match read_steam(&path, &root, &self.roots) {
                    Ok(Some(game)) => report.games.push(game),
                    Ok(None) => {}
                    Err(e) => report.warnings.push(format!("{}: {e}", path.display())),
                }
            }
        }
        report
    }
}

fn read_steam(path: &Path, root: &Path, steam_roots: &[PathBuf]) -> Result<Option<Discovery>> {
    let parsed = vdf::parse(&bounded_read(path)?)?;
    let state = parsed
        .get("AppState")
        .and_then(vdf::Value::object)
        .context("Missing Steam AppState")?;
    let text = |key| {
        state
            .get(key)
            .and_then(vdf::Value::text)
            .with_context(|| format!("Missing Steam {key}"))
    };
    let id: u32 = text("appid")?.parse()?;
    let install = text("installdir")?;
    anyhow::ensure!(
        safe_install_name(install),
        "Invalid Steam installation directory"
    );
    let directory = root.join("steamapps/common").join(install);
    if !directory.is_dir() {
        return Ok(None);
    }
    let cover = steam_roots
        .iter()
        .flat_map(|root| {
            [
                root.join(format!("appcache/librarycache/{id}_library_600x900.jpg")),
                root.join(format!("appcache/librarycache/{id}_library_600x900.png")),
                root.join(format!("appcache/librarycache/{id}/library_600x900.jpg")),
            ]
        })
        .find(|p| p.is_file());
    let target = LaunchTarget::Steam { app_id: id };
    target.validate()?;
    Ok(Some(Discovery {
        provider: Provider::Steam,
        external_id: id.to_string(),
        title: text("name")?.into(),
        install_directory: directory,
        target,
        cover,
    }))
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct EpicManifest {
    app_name: String,
    display_name: String,
    install_location: PathBuf,
    #[serde(default, rename = "bIsIncompleteInstall")]
    b_is_incomplete_install: bool,
}

impl LibraryProvider for Epic {
    fn scan(&self) -> ScanReport {
        let mut report = ScanReport::default();
        let mut seen = BTreeSet::new();
        for root in &self.manifest_roots {
            if !root.is_dir() || !seen.insert(path_key(root)) {
                continue;
            }
            report.checked_roots += 1;
            let files = match fs::read_dir(root) {
                Ok(v) => v,
                Err(e) => {
                    report
                        .warnings
                        .push(format!("Epic manifests {}: {e}", root.display()));
                    continue;
                }
            };
            for entry in files.flatten() {
                let path = entry.path();
                if !path.extension().is_some_and(|e| e == "item") {
                    continue;
                }
                let read = || -> Result<Option<Discovery>> {
                    let m: EpicManifest = serde_json::from_str(&bounded_read(&path)?)?;
                    if m.b_is_incomplete_install
                        || !m.install_location.is_absolute()
                        || !m.install_location.is_dir()
                    {
                        return Ok(None);
                    }
                    let target = LaunchTarget::Epic {
                        app_name: m.app_name.clone(),
                    };
                    target.validate()?;
                    Ok(Some(Discovery {
                        provider: Provider::Epic,
                        external_id: m.app_name,
                        title: m.display_name,
                        install_directory: m.install_location,
                        target,
                        cover: None,
                    }))
                };
                match read() {
                    Ok(Some(g)) => report.games.push(g),
                    Ok(None) => {}
                    Err(e) => report.warnings.push(format!("{}: {e}", path.display())),
                }
            }
        }
        report
    }
}

pub fn scan(settings: &Settings) -> ScanReport {
    let mut roots = settings.steam_roots.clone();
    let epic_roots = settings.epic_manifest_roots.clone();
    #[cfg(windows)]
    let mut epic_roots = epic_roots;
    #[cfg(windows)]
    {
        if let Ok(key) = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER)
            .open_subkey("Software\\Valve\\Steam")
            && let Ok(path) = key.get_value::<String, _>("SteamPath")
        {
            roots.push(path.into());
        }
        for var in ["ProgramFiles(x86)", "ProgramFiles"] {
            if let Some(p) = std::env::var_os(var) {
                roots.push(PathBuf::from(p).join("Steam"));
            }
        }
        if let Some(p) = std::env::var_os("PROGRAMDATA") {
            epic_roots.push(PathBuf::from(p).join("Epic/EpicGamesLauncher/Data/Manifests"));
        }
    }
    #[cfg(not(windows))]
    {
        if let Some(home) = std::env::var_os("HOME") {
            roots.push(PathBuf::from(&home).join(".steam/steam"));
            roots.push(PathBuf::from(home).join(".local/share/Steam"));
        }
    }
    let mut result = Steam { roots }.scan();
    let epic = Epic {
        manifest_roots: epic_roots,
    }
    .scan();
    result.games.extend(epic.games);
    result.warnings.extend(epic.warnings);
    result.checked_roots += epic.checked_roots;
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn real_layout_fixtures_skip_invalid_and_incomplete_manifests() {
        let dir = tempfile::tempdir().unwrap();
        let steam = dir.path().join("steam");
        fs::create_dir_all(steam.join("steamapps/common/Fixture Game")).unwrap();
        fs::write(
            steam.join("steamapps/appmanifest_220.acf"),
            r#""AppState" { "appid" "220" "name" "Fixture Game" "installdir" "Fixture Game" }"#,
        )
        .unwrap();
        fs::write(
            steam.join("steamapps/appmanifest_221.acf"),
            r#""AppState" { "appid" "221" "name" "Bad" "installdir" "../escape" }"#,
        )
        .unwrap();
        let report = Steam {
            roots: vec![steam.clone(), steam],
        }
        .scan();
        assert_eq!(report.games.len(), 1);
        assert_eq!(report.warnings.len(), 1);
        assert_eq!(report.games[0].external_id, "220");
        let epic = dir.path().join("epic");
        fs::create_dir(&epic).unwrap();
        let data = serde_json::json!({"AppName":"fixture-id", "DisplayName":"Fixture Epic", "InstallLocation":dir.path(), "bIsIncompleteInstall":false});
        fs::write(epic.join("a.item"), data.to_string()).unwrap();
        let mut incomplete = data.clone();
        incomplete["AppName"] = serde_json::json!("unfinished-id");
        incomplete["bIsIncompleteInstall"] = serde_json::json!(true);
        fs::write(epic.join("unfinished.item"), incomplete.to_string()).unwrap();
        assert_eq!(
            Epic {
                manifest_roots: vec![epic]
            }
            .scan()
            .games
            .len(),
            1
        );
    }
}
