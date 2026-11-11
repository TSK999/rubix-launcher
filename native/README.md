# RUBIX Launcher 2.0 — native alpha

A working Rust/iced foundation and an initial local game launcher. This is an alpha, not the complete seven-phase rebuild. The original Electron launcher is preserved outside this folder.

## Available

- Native iced/wgpu window, charcoal/purple Rubix theme, full sidebar, resizing and fullscreen.
- SQLite migrations, local profile, TOML settings, daily logs and visible errors.
- Read-only Steam library/ACF discovery and Epic `.item` discovery, including custom scan folders.
- Manual executable registration with working folder, literal arguments (one per line) and user-selected cover artwork.
- Game details, provider launch alternatives, favorites, hidden games, named collections, sorting and fuzzy title search.
- Virtualized library card rows and locally cached thumbnails.
- Official Steam/Epic protocol dispatch. Direct executable process/session tracking with crash-recovery checkpoints.
- Safe removal from the library without deleting installed game files.
- Native Windows executable, per-user installer recipe, portable package recipe and Windows CI.

## Not available yet

EA/Xbox/Riot adapters; provider process/child tracking; metadata/screenshot/achievement providers; full search indexing; mods/profiles/download manager; Minecraft launch/auth/loaders; cloud accounts/social/sync; recording/voice; controller input; tray/start-at-login; native update verification; complete accessibility validation; full v1 migration. Their pages clearly identify unavailable functionality. Manual game launch and local profiles do not require a Rubix account.

## Build

Install Rust through [rustup](https://rustup.rs/) and the Windows Visual Studio C++ build tools. From this folder:

```powershell
cargo fmt --all -- --check
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo test --locked --workspace
cargo build --locked --release
.\target\release\rubix-launcher.exe
```

The first build installs the pinned Rust toolchain and dependencies. Subsequent builds use `Cargo.lock`. No Node, Bun or web build step is needed.

Build the installer and portable ZIP after installing [NSIS](https://nsis.sourceforge.io/):

```powershell
.\packaging\build-windows.ps1
```

Packaging is per-user, creates Start Menu and optional desktop shortcuts, and supplies an uninstaller. Updates replace program files while retaining application data. A configured certificate enables signing; unsigned builds remain explicitly unsigned. See `packaging/README.md`.

## First launch

Rubix restores its local library, then checks local Steam/Epic metadata. Use **Rescan**, or **Settings** to add a Steam library folder or Epic manifest folder. Use **Add game** to select an existing executable. Every argument line is one literal process argument; spaces within a line are preserved.

Steam/Epic launch through their installed official clients. Dispatching a URI cannot prove that the game started, so those launches do not accrue guessed playtime. Direct executable sessions are measured only while Rubix stays open. Closing Rubix leaves the game running. Exit detection currently polls every three seconds, so recorded duration can include up to one extra poll interval.

Keyboard: Ctrl+F focuses search, Ctrl+N opens Add game, Escape closes a dialog or game detail, F11 toggles fullscreen, Tab/Shift+Tab move between focusable native controls. Controller navigation is not implemented.

## Diagnostics

```powershell
.\target\release\rubix-launcher.exe --self-check --data-dir C:\Temp\RubixCheck
.\target\release\rubix-launcher.exe --scan --data-dir C:\Temp\RubixCheck
.\target\release\rubix-launcher.exe --benchmark --data-dir C:\Temp\RubixBench
.\target\release\rubix-launcher.exe --safe-mode
```

Headless commands write JSON reports to their data folder. Benchmarks use explicitly synthetic fixtures and a separate benchmark database; they do not modify installed games. They do not measure Windows GUI startup or memory. Do not present them as Windows GUI benchmarks.

Read [the audit](docs/AUDIT.md), [architecture](docs/ARCHITECTURE.md), and [validation results](docs/VALIDATION.md) for evidence, boundaries and next steps.

GPL-3.0-or-later, matching the original project. The original icon is reused from `public/favicon.ico`.
