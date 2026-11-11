//! Small platform boundary. External metadata never supplies a shell command.
use anyhow::Result;
use rubix_core::LaunchTarget;
use std::path::Path;

pub trait DesktopIntegration: Send + Sync {
    fn open_game_protocol(&self, target: &LaunchTarget) -> Result<()>;
    fn open_folder(&self, folder: &Path) -> Result<()>;
}

#[derive(Debug, Default)]
pub struct NativeDesktop;

impl DesktopIntegration for NativeDesktop {
    fn open_game_protocol(&self, target: &LaunchTarget) -> Result<()> {
        // Only typed, allowlisted protocol targets can reach ShellExecute.
        open(&target.protocol_uri()?)
    }
    fn open_folder(&self, folder: &Path) -> Result<()> {
        anyhow::ensure!(folder.is_dir(), "This folder does not exist");
        open(&folder.canonicalize()?.to_string_lossy())
    }
}

#[cfg(windows)]
fn open(target: &str) -> Result<()> {
    use windows::{
        Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL},
        core::PCWSTR,
    };
    let verb: Vec<u16> = "open\0".encode_utf16().collect();
    let target: Vec<u16> = target.encode_utf16().chain(Some(0)).collect();
    // SAFETY: both UTF-16 buffers remain alive for the synchronous call and are NUL terminated.
    let result = unsafe {
        ShellExecuteW(
            None,
            PCWSTR(verb.as_ptr()),
            PCWSTR(target.as_ptr()),
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };
    anyhow::ensure!(
        result.0 as isize > 32,
        "Windows could not open the registered launcher (error {}). Install or repair the official launcher.",
        result.0 as isize
    );
    Ok(())
}

#[cfg(not(windows))]
fn open(target: &str) -> Result<()> {
    let status = std::process::Command::new("xdg-open")
        .arg(target)
        .status()?;
    anyhow::ensure!(
        status.success(),
        "The desktop could not open the registered launcher"
    );
    Ok(())
}
