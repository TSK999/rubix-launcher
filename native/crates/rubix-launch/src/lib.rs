//! Direct child tracking. Delegated storefront launches deliberately do not invent playtime.
use anyhow::{Context, Result};
use rubix_core::LaunchTarget;
use rubix_platform_windows::{DesktopIntegration, NativeDesktop};
use std::{
    process::{Child, Command, ExitStatus, Stdio},
    sync::{Arc, Mutex},
    time::Instant,
};

#[derive(Debug, Clone)]
pub struct RunningGame {
    child: Arc<Mutex<Child>>,
    started: Instant,
}

#[derive(Debug, Clone)]
pub enum LaunchResult {
    Direct(RunningGame),
    Delegated,
}

impl RunningGame {
    pub fn elapsed_seconds(&self) -> u64 {
        self.started.elapsed().as_secs()
    }
    pub fn poll(&self) -> Result<Option<ExitStatus>> {
        self.child
            .lock()
            .map_err(|_| anyhow::anyhow!("Game process lock was interrupted"))?
            .try_wait()
            .context("Could not query the game process")
    }
    // Dropping this handle never kills the child process. No unrelated PIDs are consulted.
}

pub fn launch(target: &LaunchTarget) -> Result<LaunchResult> {
    target.validate()?;
    match target {
        LaunchTarget::Executable {
            path,
            arguments,
            working_directory,
        } => {
            let mut command = Command::new(path);
            command
                .args(arguments)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null());
            if let Some(directory) = working_directory.as_deref().or_else(|| path.parent()) {
                command.current_dir(directory);
            }
            let child = command
                .spawn()
                .with_context(|| format!("Could not launch {}", path.display()))?;
            Ok(LaunchResult::Direct(RunningGame {
                child: Arc::new(Mutex::new(child)),
                started: Instant::now(),
            }))
        }
        _ => {
            NativeDesktop.open_game_protocol(target)?;
            Ok(LaunchResult::Delegated)
        }
    }
}

#[cfg(test)]
mod native_process_test {
    use super::*;
    #[test]
    fn native_test_executable_can_launch_and_exit() {
        let directory = tempfile::tempdir().unwrap();
        let target = LaunchTarget::Executable {
            path: std::env::current_exe().unwrap(),
            arguments: vec!["--list".into()],
            working_directory: Some(directory.path().into()),
        };
        let LaunchResult::Direct(process) = launch(&target).unwrap() else {
            panic!("expected direct launch")
        };
        assert!(process.child.lock().unwrap().wait().unwrap().success());
        assert!(process.poll().unwrap().unwrap().success());
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    #[test]
    fn launch_arguments_are_literal_and_working_directory_is_used() {
        let dir = tempfile::tempdir().unwrap();
        let marker = dir.path().join("literal.txt");
        // The shell is a harmless fixture executable here, never an application launch mechanism.
        let target = LaunchTarget::Executable {
            path: "/bin/sh".into(),
            arguments: vec![
                "-c".into(),
                "printf '%s' \"$1\" > literal.txt".into(),
                "fixture".into(),
                "$(touch SHOULD_NOT_EXIST) spaces".into(),
            ],
            working_directory: Some(dir.path().into()),
        };
        let LaunchResult::Direct(child) = launch(&target).unwrap() else {
            panic!("expected a direct process")
        };
        child.child.lock().unwrap().wait().unwrap();
        assert_eq!(
            std::fs::read_to_string(marker).unwrap(),
            "$(touch SHOULD_NOT_EXIST) spaces"
        );
        assert!(!dir.path().join("SHOULD_NOT_EXIST").exists());
        assert!(child.poll().unwrap().unwrap().success());
    }
}
