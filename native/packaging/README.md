# Windows packaging

`build-windows.ps1` builds the locked workspace, embeds the original Rubix icon/version resource, and creates a per-user NSIS installer and portable ZIP with SHA-256 checksums. The default Visual Studio target links its CRT statically. No web application files or JavaScript runtimes are packaged.

Install NSIS 3 and Visual Studio C++ tools, then run `./packaging/build-windows.ps1` in PowerShell. `-SkipBuild` reuses the existing release executable.

Installation uses `%LOCALAPPDATA%\Programs\Rubix Launcher 2`, writes only HKCU entries, creates Start Menu shortcuts, and offers an optional desktop shortcut. The native product has a distinct installation directory and uninstall key from the Electron launcher. Uninstall removes only known program/shortcut files; application data and installed games remain.

Close Rubix before replacing its executable. The installer never terminates games or unrelated processes. Install/uninstall and upgrades still require testing on a real Windows 11 system; successful cross-compilation alone does not verify them.

To sign, configure `RUBIX_SIGN_CERT_THUMBPRINT` for a certificate in the Windows certificate store and `RUBIX_SIGN_TIMESTAMP_URL` for its timestamp service. Ensure `signtool` is available. The script signs both the executable and installer and aborts on signing failure. No certificate is included, and builds without this configuration are unsigned.

For Linux-to-Windows development, install the Rust `x86_64-pc-windows-gnu` target and MinGW-w64. Set `CC_x86_64_pc_windows_gnu` and `CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER` to `x86_64-w64-mingw32-gcc`, then run `cargo build --locked --release --target x86_64-pc-windows-gnu`. Inspect DLL dependencies before distribution. Cross-built artifacts and MSVC CI artifacts must be validated separately.
