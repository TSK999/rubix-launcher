use anyhow::Result;
use rubix_core::{Game, LaunchTarget, Settings};
use rubix_database::Database;
use rubix_launch::{LaunchResult, RunningGame};
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct ActiveSession {
    pub game_id: String,
    pub session_id: String,
    pub process: RunningGame,
}
#[derive(Debug)]
pub struct Started {
    pub game_id: String,
    pub session: Option<ActiveSession>,
}
#[derive(Debug)]
pub struct PollResult {
    pub finished: Vec<(String, String)>,
    pub games: Vec<Game>,
}

pub async fn start(db: Database, game_id: String, target: LaunchTarget) -> Result<Started> {
    target.validate()?;
    let session_id = if matches!(target, LaunchTarget::Executable { .. }) {
        Some(db.begin_session(&game_id).await?)
    } else {
        None
    };
    let result = tokio::task::spawn_blocking(move || rubix_launch::launch(&target)).await?;
    match result {
        Ok(LaunchResult::Direct(process)) => Ok(Started {
            game_id: game_id.clone(),
            session: Some(ActiveSession {
                game_id,
                session_id: session_id.expect("direct launches create a session"),
                process,
            }),
        }),
        Ok(LaunchResult::Delegated) => Ok(Started {
            game_id,
            session: None,
        }),
        Err(error) => {
            if let Some(id) = session_id {
                db.checkpoint(&id, 0, Some("launch_failed")).await?;
            }
            Err(error)
        }
    }
}
pub async fn poll(db: Database, sessions: Vec<ActiveSession>) -> Result<PollResult> {
    let checks = tokio::task::spawn_blocking(move || {
        sessions
            .into_iter()
            .map(|session| {
                let status = session.process.poll();
                (session, status)
            })
            .collect::<Vec<_>>()
    })
    .await?;
    let mut finished = Vec::new();
    for (session, status) in checks {
        let status = status?;
        let outcome = status.map(|s| {
            if s.success() {
                "exited"
            } else {
                "nonzero_exit"
            }
        });
        db.checkpoint(
            &session.session_id,
            session.process.elapsed_seconds(),
            outcome,
        )
        .await?;
        if let Some(status) = status {
            finished.push((session.game_id, format!("Game exited with {status}")));
        }
    }
    Ok(PollResult {
        finished,
        games: db.games().await?,
    })
}
pub async fn save_settings(settings: Settings, path: PathBuf) -> Result<()> {
    tokio::task::spawn_blocking(move || settings.save(&path)).await??;
    Ok(())
}
pub async fn shutdown(
    db: Option<Database>,
    sessions: Vec<ActiveSession>,
    settings: Settings,
    path: PathBuf,
) -> Result<()> {
    save_settings(settings, path).await?;
    if let Some(db) = db {
        for session in sessions {
            db.checkpoint(
                &session.session_id,
                session.process.elapsed_seconds(),
                Some("launcher_closed"),
            )
            .await?;
        }
        db.close().await;
    }
    Ok(())
}
pub fn error_message(error: anyhow::Error) -> String {
    format!("{error:#}")
}
