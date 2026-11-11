# Validation and implementation status

2026-11-11 · `2.0.0-alpha.1`

## Scope delivered

Phase 1 is implemented as a functioning native application, with a Windows CI workflow configured. Phase 2 has usable Steam/Epic/manual library functionality; it is not complete. Later phases are explicitly unavailable. The original application is unchanged.

| Check | Result |
| --- | --- |
| `cargo fmt --all -- --check` | Passed |
| `cargo clippy --locked --workspace --all-targets -- -D warnings` | Passed on Linux |
| `cargo test --locked --workspace` | 12 tests passed, no failed tests |
| `cargo build --locked --release` | Passed on Linux x86_64 |
| `cargo build --locked --release --target x86_64-pc-windows-gnu` | Passed; Windows GUI PE executable produced |
| NSIS installer compilation | Passed with NSIS 3.11 |
| Windows import table inspection | Only Windows system DLL imports; no bundled browser or extra compiler-runtime DLL required by the inspected GNU build |
| Release `--self-check` | SQLite integrity `ok`; database opens and migrates |
| Native UI smoke test | Linux Xvfb; real iced/wgpu release window, navigation, Ctrl+N, text entry, Tab, Enter, manual registration, details, favorite, actual executable launch, persisted session, reopening the saved profile and graceful close (exit 0) verified |
| Windows 11 execution, GPU rendering, install/uninstall/upgrade | Not performed on this Linux host |
| Windows MSVC CI | Configured; consult the GitHub workflow for its current run status |

The automated tests cover stable identity, unsafe protocol IDs, TOML preservation/validation, SQLite migrations and transactional imports, duplicate provider launch options, session recovery, Valve escaped paths/malformed input, provider-layout fixtures, literal process arguments/cwd, a native harmless test executable, fuzzy search, virtualized ranges and saved-page fallback.

## Real launch smoke test

A separate harmless Rust executable was selected through the native Add game dialog. Its filename contained a space, its working directory was configured, and its single argument was `literal spaces;$(no shell)`. The child wrote exactly that argument and the expected working directory to a fixture result file. No shell substitution took place. The GUI displayed Running, the favorite was persisted, and SQLite recorded an exited session.

The fixture slept for five seconds; the three-second observer recorded six seconds. Direct session duration can overestimate exit time by up to one poll interval. Tracking does not continue after Rubix closes. Launcher-spawned descendants and Steam/Epic game lifetimes are not tracked yet.

The Linux test display used software graphics. Captures forced a resize because this headless graphics setup did not consistently preserve unchanged pixels during partial redraws. These captures verify presentation and behavior in the test environment; they do not establish Windows rendering correctness.

## Measured release results

All values below are actual Linux x86_64 measurements in this workspace, not Windows results or performance guarantees.

| Measurement | Result |
| --- | --- |
| Database open/migrate/integrity diagnostic | 10.81 ms on an empty isolated profile |
| Fuzzy title search over 10,000 synthetic records | 1.27 ms |
| Transactional import of 1,000 synthetic records | 98.16 ms |
| Load 1,000 records, grouped with installations | 13.30 ms |
| Native window appeared, Xvfb smoke run | 112.76 ms; window mapping only, not first-frame completion |
| Idle resident memory after UI interactions | 158,112 KiB (154.41 MiB), software graphics |
| Idle CPU observation | 0 additional process CPU ticks across a five-second idle wait |
| Windows startup / idle working set / CPU / frame latency | Unmeasured |

Raw headless results are supplied as `benchmark.json` and `self-check.json` in the release bundle. The 150 MB memory goal remains a Windows engineering target, not an achieved claim.

## Important limitations and next work

1. Test the supplied unsigned executable and per-user installer on Windows 11. Validate Direct3D rendering, file dialogs, multiple monitors/DPI, shutdown and upgrades. Run the MSVC CI workflow.
2. Complete Phase 2: EA/Xbox/Riot discovery and launching, provider/descendant lifetime tracking, artwork/metadata sourcing, editable launch settings, accurate exit timestamps, and explicit updating/install-state support.
3. Add a migration preview/import/rollback tool. This build intentionally does not read the old browser, Supabase or Minecraft token stores.
4. Implement and test transactional mod writes, archive safety, backups, profiles and strict dependency resolution before enabling the Mods page.
5. Configure legitimate Microsoft/provider account clients and add secure credential storage before enabling Minecraft or cloud/social features.
6. Implement capture, voice, controllers, tray/startup, signed update verification and full accessibility testing behind their own tested service boundaries.

Automatic refresh currently occurs at startup, with manual rescans available. Periodic file watching, a bounded artwork-cache eviction policy, richer background search indexing, full game metadata, compatibility controls and non-title search are not implemented. Home and library cards show actual data only; missing artwork is labeled.

## Files to review

Start with `README.md`, `docs/AUDIT.md`, `docs/ARCHITECTURE.md`, `crates/rubix-app/src/application.rs`, the provider parsers, the SQLite migration, and `packaging/`. `Cargo.lock` and `rust-toolchain.toml` capture the selected Rust dependency/toolchain resolution.

The Windows executable is `native/dist/rubix-launcher.exe` when assembled for delivery. The installer is `native/dist/Rubix-Launcher-2.0.0-alpha.1-Setup.exe`. The source build output is `target/release/rubix-launcher.exe` on a normal Windows build, or `target/x86_64-pc-windows-gnu/release/rubix-launcher.exe` when cross-compiling.
