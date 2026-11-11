param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$NativeRoot = Split-Path $PSScriptRoot -Parent
Push-Location $NativeRoot
try {
    if (-not $SkipBuild) {
        & cargo build --locked --release
        if ($LASTEXITCODE -ne 0) { throw 'Rust release build failed.' }
    }
    $AppExe = Join-Path $NativeRoot 'target\release\rubix-launcher.exe'
    if (-not (Test-Path -LiteralPath $AppExe)) { throw "Executable not found: $AppExe" }
    $VersionLine = Get-Content (Join-Path $NativeRoot 'Cargo.toml') | Where-Object { $_ -match '^version = "' } | Select-Object -First 1
    $Version = ($VersionLine -split '"')[1]
    $Dist = Join-Path $NativeRoot 'dist'
    New-Item -ItemType Directory -Force -Path $Dist | Out-Null
    function Sign-Artifact([string]$Artifact) {
        if ($env:RUBIX_SIGN_CERT_THUMBPRINT) {
            if (-not $env:RUBIX_SIGN_TIMESTAMP_URL) { throw 'Set RUBIX_SIGN_TIMESTAMP_URL for certificate signing.' }
            & signtool sign /sha1 $env:RUBIX_SIGN_CERT_THUMBPRINT /fd SHA256 /tr $env:RUBIX_SIGN_TIMESTAMP_URL /td SHA256 $Artifact
            if ($LASTEXITCODE -ne 0) { throw "Signing failed: $Artifact" }
        }
    }
    Sign-Artifact $AppExe
    $MakensisCommand = Get-Command makensis.exe -ErrorAction SilentlyContinue
    $Makensis = if ($MakensisCommand) { $MakensisCommand.Source } else { Join-Path ${env:ProgramFiles(x86)} 'NSIS\makensis.exe' }
    if (-not (Test-Path -LiteralPath $Makensis)) { throw 'Install NSIS 3, then run this script again.' }
    & $Makensis "/DVERSION=$Version" "/DAPP_EXE=$AppExe" "/DOUT_DIR=$Dist" (Join-Path $PSScriptRoot 'rubix.nsi')
    if ($LASTEXITCODE -ne 0) { throw 'Installer build failed.' }
    $Installer = Join-Path $Dist "Rubix-Launcher-$Version-Setup.exe"
    Sign-Artifact $Installer
    $Portable = Join-Path $Dist "Rubix-Launcher-$Version-Windows-x64.zip"
    Compress-Archive -Path $AppExe,(Join-Path $NativeRoot 'LICENSE'),(Join-Path $NativeRoot 'README.md') -DestinationPath $Portable -Force
    $Checksums = @($Installer,$Portable) | ForEach-Object { $Hash = Get-FileHash -LiteralPath $_ -Algorithm SHA256; "$($Hash.Hash.ToLowerInvariant())  $([IO.Path]::GetFileName($_))" }
    $Checksums | Set-Content (Join-Path $Dist 'SHA256SUMS.txt') -Encoding ascii
    Write-Host "Release files: $Dist"
    if (-not $env:RUBIX_SIGN_CERT_THUMBPRINT) { Write-Host 'These artifacts are unsigned.' }
} finally { Pop-Location }
