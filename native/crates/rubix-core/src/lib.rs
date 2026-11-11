//! GUI-independent domain types, configuration, and application-owned paths.
mod settings;
pub use settings::*;

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("{0}")]
    Invalid(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Provider {
    Steam,
    Epic,
    Manual,
}

impl Provider {
    pub fn label(self) -> &'static str {
        match self {
            Self::Steam => "Steam",
            Self::Epic => "Epic Games",
            Self::Manual => "Custom game",
        }
    }
    pub fn key(self) -> &'static str {
        match self {
            Self::Steam => "steam",
            Self::Epic => "epic",
            Self::Manual => "manual",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum LaunchTarget {
    Executable {
        path: PathBuf,
        arguments: Vec<String>,
        working_directory: Option<PathBuf>,
    },
    Steam {
        app_id: u32,
    },
    Epic {
        app_name: String,
    },
}

impl LaunchTarget {
    pub fn validate(&self) -> Result<(), Error> {
        match self {
            Self::Executable {
                path,
                arguments,
                working_directory,
            } => {
                if !path.is_absolute() || !path.is_file() {
                    return Err(Error::Invalid(
                        "The game executable could not be found. Choose its current location."
                            .into(),
                    ));
                }
                #[cfg(windows)]
                if !path
                    .extension()
                    .is_some_and(|x| x.eq_ignore_ascii_case("exe"))
                {
                    return Err(Error::Invalid("Choose a Windows .exe file.".into()));
                }
                if arguments.iter().any(|s| s.contains('\0')) {
                    return Err(Error::Invalid(
                        "Launch arguments contain an invalid character.".into(),
                    ));
                }
                if let Some(dir) = working_directory
                    && (!dir.is_absolute() || !dir.is_dir())
                {
                    return Err(Error::Invalid(
                        "The working folder could not be found.".into(),
                    ));
                }
            }
            Self::Steam { app_id } if *app_id == 0 => {
                return Err(Error::Invalid("Invalid Steam application ID.".into()));
            }
            Self::Epic { app_name }
                if app_name.is_empty()
                    || !app_name
                        .bytes()
                        .all(|c| c.is_ascii_alphanumeric() || b"-_.".contains(&c)) =>
            {
                return Err(Error::Invalid(
                    "Epic's launch identifier is invalid.".into(),
                ));
            }
            _ => {}
        }
        Ok(())
    }
    pub fn protocol_uri(&self) -> Result<String, Error> {
        self.validate()?;
        match self {
            Self::Steam { app_id } => Ok(format!("steam://rungameid/{app_id}")),
            Self::Epic { app_name } => Ok(format!(
                "com.epicgames.launcher://apps/{app_name}?action=launch&silent=true"
            )),
            Self::Executable { .. } => Err(Error::Invalid(
                "This game uses an executable, not a launcher URI.".into(),
            )),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Discovery {
    pub provider: Provider,
    pub external_id: String,
    pub title: String,
    pub install_directory: PathBuf,
    pub target: LaunchTarget,
    pub cover: Option<PathBuf>,
}

impl Discovery {
    pub fn stable_id(&self) -> String {
        Uuid::new_v5(
            &Uuid::NAMESPACE_URL,
            format!("rubix:{}:{}", self.provider.key(), self.external_id).as_bytes(),
        )
        .to_string()
    }
    /// Only exact installation evidence is used for merging. Titles are not identities.
    pub fn merge_key(&self) -> String {
        match &self.target {
            LaunchTarget::Executable { path, .. } => format!("executable:{}", path_key(path)),
            _ => format!("installation:{}", path_key(&self.install_directory)),
        }
    }
}

pub fn path_key(path: &Path) -> String {
    let canonical = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let text = canonical.to_string_lossy().into_owned();
    #[cfg(windows)]
    let text = text
        .trim_start_matches(r"\\?\")
        .replace('/', "\\")
        .to_lowercase();
    text
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Installation {
    pub id: String,
    pub provider: Provider,
    pub install_directory: PathBuf,
    pub target: LaunchTarget,
    pub available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Game {
    pub id: String,
    pub title: String,
    pub favorite: bool,
    pub hidden: bool,
    pub collections: Vec<String>,
    pub cover: Option<PathBuf>,
    pub installations: Vec<Installation>,
    pub total_seconds: u64,
    pub last_played: Option<i64>,
}

pub fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

pub fn format_playtime(seconds: u64) -> String {
    if seconds < 60 {
        format!("{seconds}s")
    } else if seconds < 3600 {
        format!("{}m", seconds / 60)
    } else {
        format!("{}h {}m", seconds / 3600, seconds % 3600 / 60)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn protocol_ids_cannot_inject_parameters() {
        for id in ["", "abc?evil=true", "abc/../../", "abc\" --exec"] {
            assert!(
                LaunchTarget::Epic {
                    app_name: id.into()
                }
                .protocol_uri()
                .is_err()
            );
        }
        assert!(LaunchTarget::Steam { app_id: 0 }.protocol_uri().is_err());
        assert_eq!(
            LaunchTarget::Steam { app_id: 220 }.protocol_uri().unwrap(),
            "steam://rungameid/220"
        );
    }
    #[test]
    fn identity_is_provider_scoped_and_title_independent() {
        let mut game = Discovery {
            provider: Provider::Steam,
            external_id: "220".into(),
            title: "Half-Life 2".into(),
            install_directory: "/games/hl2".into(),
            target: LaunchTarget::Steam { app_id: 220 },
            cover: None,
        };
        let id = game.stable_id();
        game.title = "Custom title".into();
        assert_eq!(id, game.stable_id());
        game.provider = Provider::Epic;
        assert_ne!(id, game.stable_id());
    }
}
