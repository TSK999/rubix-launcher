#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]
mod application;
mod diagnostics;
mod services;

use anyhow::{Context, Result};
use rubix_core::{DataPaths, Settings};
use std::path::PathBuf;

fn main() {
    let headless = std::env::args_os()
        .any(|a| matches!(a.to_str(), Some("--self-check" | "--scan" | "--benchmark")));
    if let Err(error) = run() {
        eprintln!("Rubix could not start: {error:#}");
        if !headless {
            let _ = rfd::MessageDialog::new()
                .set_title("Rubix Launcher")
                .set_description(format!("Rubix could not start.\n\n{error:#}"))
                .set_level(rfd::MessageLevel::Error)
                .show();
        }
        std::process::exit(1);
    }
}

fn run() -> Result<()> {
    let mut args = std::env::args_os().skip(1);
    let (mut root, mut command, mut safe) = (None, None, false);
    while let Some(arg) = args.next() {
        match arg.to_str() {
            Some("--data-dir") => {
                root = Some(PathBuf::from(
                    args.next().context("--data-dir requires a folder")?,
                ))
            }
            Some("--self-check" | "--scan" | "--benchmark") => {
                command = Some(arg.to_string_lossy().into_owned())
            }
            Some("--safe-mode") => safe = true,
            Some("--version") => {
                println!("RUBIX Launcher {}", env!("CARGO_PKG_VERSION"));
                return Ok(());
            }
            _ => anyhow::bail!("Unknown option: {}", arg.to_string_lossy()),
        }
    }
    let paths = DataPaths::new(root)?;
    let profile_lock = std::fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(paths.root.join("profile.lock"))?;
    profile_lock.try_lock().context("Rubix is already using this profile. Close its other window or choose a different --data-dir.")?;
    let appender = tracing_appender::rolling::Builder::new()
        .rotation(tracing_appender::rolling::Rotation::DAILY)
        .filename_prefix("rubix")
        .filename_suffix("log")
        .max_log_files(7)
        .build(&paths.logs)?;
    let (writer, _guard) = tracing_appender::non_blocking(appender);
    tracing_subscriber::fmt()
        .with_ansi(false)
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,wgpu=error,wgpu_hal=error,naga=error".into()),
        )
        .with_writer(writer)
        .init();
    std::panic::set_hook(Box::new(|info| {
        tracing::error!("Application panic: {info}")
    }));
    let (settings, warning) = match Settings::load(&paths.settings) {
        Ok(settings) => (settings, None),
        Err(error) => {
            let backup = paths.root.join(format!(
                "settings-unreadable-{}.toml",
                rubix_core::now_unix()
            ));
            std::fs::copy(&paths.settings, &backup)
                .context("Could not preserve unreadable settings")?;
            (
                Settings::default(),
                Some(format!(
                    "{error} A backup was saved as {}. Defaults are being used.",
                    backup.display()
                )),
            )
        }
    };
    if let Some(command) = command {
        return tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()?
            .block_on(diagnostics::run(&command, paths, settings));
    }
    tracing::info!(
        version = env!("CARGO_PKG_VERSION"),
        "Starting native launcher"
    );
    application::run(paths, settings, warning, safe).map_err(Into::into)
}
