# Native architecture

The executable and its primary interface are Rust and iced/wgpu. There is no Electron, Tauri, WebView, HTML renderer or JavaScript application runtime in this workspace. The old implementation lives alongside it solely as a reference.

| Crate | Responsibility | Depends on |
| --- | --- | --- |
| `rubix-core` | Typed game/installation/launch models, stable IDs, TOML configuration, owned data paths | No UI or database crates |
| `rubix-database` | SQLite migrations, atomic discovery imports, favorites, collections, session checkpoints | core |
| `rubix-providers` | Bounded Valve KeyValues parsing, Steam libraries, Epic manifests, read-only discovery | core |
| `rubix-platform-windows` | `DesktopIntegration` boundary, typed registered protocol dispatch, folder opening | core; Windows APIs behind `cfg(windows)` |
| `rubix-launch` | Explicit executable/argument/cwd spawning, direct child handles and exit observation | core, platform |
| `rubix-library` | Discovery/import orchestration, bounded thumbnail workers, manual registration, local fuzzy search | core, database, providers |
| `rubix-ui` | Theme, reusable cards/sidebar/dialogs/settings/detail views, virtualized library rows, UI messages | core, library search helpers, iced |
| `rubix-app` | iced boot/update/subscriptions, async task orchestration, startup/CLI, logs, shutdown | All above |

Dependencies are acyclic. Unimplemented subsystems do not get empty pretend-service crates.

## Execution and persistence

The iced update function changes presentation state and schedules `Task`s. Manifest discovery, image decoding, process creation and settings replacement run in worker tasks. SQLite queries use sqlx's Tokio runtime; blocking filesystem checks run outside the iced event thread. Only active direct launches enable the three-second process/checkpoint subscription. Idle operation has no polling or cloud service tasks.

SQLite has foreign keys, a migration journal, WAL journaling, indexes and one pooled connection. A scan imports in one transaction. Game identity is provider-scoped UUIDv5; an exact normalized installation directory can associate multiple provider launch options with one game. Manual entries deduplicate by executable path, so unrelated executables sharing a directory are not merged. Names never establish identity.

Provider metadata is untrusted. Steam install names cannot contain directory separators or traversal. Epic identifiers are validated before forming an allowlisted protocol URI. SQL is parameterized. Direct arguments are passed to `Command::args`; there is no shell concatenation. Scans never delete installations or game files.

Direct sessions measure elapsed monotonic time. Checkpoints replace the measured elapsed total, preventing duplicate accumulation. On restart, unfinished sessions end at their last checkpoint. Closing Rubix records the last measured interval and leaves games running. Playtime after Rubix closes is not measured. Exit detection polls every three seconds and may include up to one interval after the actual exit. A nonzero exit is reported as a nonzero exit, not automatically classified as a crash. Launcher-spawned descendants and provider process association remain unimplemented.

Configuration is TOML, written through a synced temporary file and atomic replacement. The app serializes settings saves and queues the latest dirty snapshot. Unreadable settings are copied to a timestamped backup before defaults are used. Logs rotate daily, retaining at most seven files. No tokens or passwords are used in this build.

The library renders fixed-height rows around the visible range, plus two overscan rows on each side. Artwork is decoded serially off-thread with dimensions/allocation limits and cached as bounded thumbnails. Whole-library filtering still runs in presentation code: a background search index is a future improvement if measured latency warrants it.

## Storage and platform boundary

Default Windows data lives in `%LOCALAPPDATA%\Rubix\Rubix Launcher 2\data` as resolved by the `directories` crate. Use **Settings → Open data folder** for the authoritative path. `--data-dir <folder>` creates an isolated profile for diagnostics/testing. It never targets the old Electron or Minecraft folders by default.

The Windows target uses `ShellExecuteW` for registered Steam/Epic URIs and `std::process::Command` for a direct executable. Registry Steam discovery is Windows-only. A development Linux fallback uses `xdg-open`; Linux is not the supported release target.

Future auth must add a platform credential interface implemented with Windows Credential Manager/DPAPI, never a plaintext fallback. Future downloads, mod transactions, Minecraft, social, voice and capture should get separate crates when they acquire working behavior and tests.

## Dependency verification

Direct versions were checked against the crates.io API on 2026-11-11, and selected APIs were checked against downloaded crate source. Rust is pinned to 1.99.1; iced is 0.14.0, sqlx 0.9.0, Tokio 1.54.1 and windows 0.62.2. `Cargo.lock` records the exact resolution. Build and CI use `--locked`.

References: [iced application API](https://docs.rs/iced/0.14.0/iced/application/), [sqlx 0.9](https://docs.rs/sqlx/0.9.0/sqlx/), [Rust release manifest](https://static.rust-lang.org/dist/channel-rust-stable.toml).
