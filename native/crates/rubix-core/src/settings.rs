use crate::Error;
use serde::{Deserialize, Serialize};
use std::{
    io::Write,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub schema_version: u32,
    pub last_page: String,
    pub display_name: String,
    pub accent: Accent,
    pub scale: f32,
    pub window_width: f32,
    pub window_height: f32,
    pub window_x: Option<f32>,
    pub window_y: Option<f32>,
    pub sort: Sort,
    pub steam_roots: Vec<PathBuf>,
    pub epic_manifest_roots: Vec<PathBuf>,
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Accent {
    #[default]
    Purple,
    Blue,
    Amber,
}

impl std::fmt::Display for Accent {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{self:?}")
    }
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Sort {
    #[default]
    Title,
    RecentlyPlayed,
    Playtime,
}

impl std::fmt::Display for Sort {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::Title => "Name",
            Self::RecentlyPlayed => "Recently played",
            Self::Playtime => "Most played",
        })
    }
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            schema_version: 1,
            last_page: "Home".into(),
            display_name: "Player".into(),
            accent: Accent::Purple,
            scale: 1.0,
            window_width: 1280.0,
            window_height: 820.0,
            window_x: None,
            window_y: None,
            sort: Sort::Title,
            steam_roots: Vec::new(),
            epic_manifest_roots: Vec::new(),
        }
    }
}

impl Settings {
    pub fn load(path: &Path) -> Result<Self, Error> {
        match std::fs::read_to_string(path) {
            Ok(s) => {
                let settings: Self = toml::from_str(&s)
                    .map_err(|e| Error::Invalid(format!("Settings could not be read: {e}")))?;
                settings.validate()?;
                Ok(settings)
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Self::default()),
            Err(e) => Err(e.into()),
        }
    }
    pub fn validate(&self) -> Result<(), Error> {
        if self.schema_version != 1 {
            return Err(Error::Invalid(
                "These settings were created by a newer Rubix version.".into(),
            ));
        }
        if !self.scale.is_finite() || !(0.8..=1.6).contains(&self.scale) {
            return Err(Error::Invalid(
                "Interface scale must be between 80% and 160%.".into(),
            ));
        }
        if !self.window_width.is_finite()
            || !self.window_height.is_finite()
            || !(640.0..=16384.0).contains(&self.window_width)
            || !(480.0..=16384.0).contains(&self.window_height)
        {
            return Err(Error::Invalid(
                "Saved window dimensions are invalid.".into(),
            ));
        }
        if self.window_x.is_some_and(|v| !v.is_finite())
            || self.window_y.is_some_and(|v| !v.is_finite())
        {
            return Err(Error::Invalid("Saved window position is invalid.".into()));
        }
        if self.display_name.trim().is_empty() || self.display_name.chars().count() > 64 {
            return Err(Error::Invalid(
                "Display name must contain 1–64 characters.".into(),
            ));
        }
        Ok(())
    }
    /// Atomic replacement on the same filesystem; interruption preserves the previous file.
    pub fn save(&self, path: &Path) -> Result<(), Error> {
        self.validate()?;
        let parent = path
            .parent()
            .ok_or_else(|| Error::Invalid("Settings path has no parent.".into()))?;
        std::fs::create_dir_all(parent)?;
        let mut temp = tempfile::NamedTempFile::new_in(parent)?;
        temp.write_all(
            toml::to_string_pretty(self)
                .map_err(|e| Error::Invalid(e.to_string()))?
                .as_bytes(),
        )?;
        temp.as_file().sync_all()?;
        temp.persist(path).map_err(|e| e.error)?;
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub struct DataPaths {
    pub root: PathBuf,
    pub database: PathBuf,
    pub settings: PathBuf,
    pub logs: PathBuf,
    pub artwork: PathBuf,
}

impl DataPaths {
    pub fn new(root: Option<PathBuf>) -> Result<Self, Error> {
        let root = match root {
            Some(p) => p,
            None => directories::ProjectDirs::from("se", "Rubix", "Rubix Launcher 2")
                .ok_or_else(|| {
                    Error::Invalid("Windows did not supply an application data folder.".into())
                })?
                .data_local_dir()
                .to_path_buf(),
        };
        std::fs::create_dir_all(&root)?;
        let paths = Self {
            database: root.join("rubix.db"),
            settings: root.join("settings.toml"),
            logs: root.join("logs"),
            artwork: root.join("artwork"),
            root,
        };
        std::fs::create_dir_all(&paths.logs)?;
        std::fs::create_dir_all(&paths.artwork)?;
        Ok(paths)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn settings_round_trip_and_corruption_preservation() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("settings.toml");
        let mut settings = Settings {
            display_name: "Notis".into(),
            ..Settings::default()
        };
        settings.save(&file).unwrap();
        assert_eq!(Settings::load(&file).unwrap(), settings);
        settings.scale = f32::NAN;
        assert!(settings.save(&file).is_err());
        assert_eq!(Settings::load(&file).unwrap().display_name, "Notis");
        std::fs::write(&file, "broken = [").unwrap();
        assert!(Settings::load(&file).is_err());
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "broken = [");
    }
}
