Unicode true
!include "MUI2.nsh"
!include "x64.nsh"
!ifndef VERSION
  !define VERSION "2.0.0-alpha.1"
!endif
!ifndef APP_EXE
  !define APP_EXE "..\target\release\rubix-launcher.exe"
!endif
!ifndef OUT_DIR
  !define OUT_DIR "..\dist"
!endif
Name "RUBIX Launcher 2 (Alpha)"
OutFile "${OUT_DIR}/Rubix-Launcher-${VERSION}-Setup.exe"
InstallDir "$LOCALAPPDATA\Programs\Rubix Launcher 2"
InstallDirRegKey HKCU "Software\Rubix\NativeLauncher" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
!define MUI_ICON "${__FILEDIR__}/../assets/rubix.ico"
!define MUI_UNICON "${__FILEDIR__}/../assets/rubix.ico"
!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "${__FILEDIR__}/../LICENSE"
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "This release requires 64-bit Windows."
    Abort
  ${EndIf}
FunctionEnd

Section "RUBIX Launcher 2" Main
  SectionIn RO
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  File /oname=rubix-launcher.exe "${APP_EXE}"
  File /oname=LICENSE.txt "${__FILEDIR__}/../LICENSE"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\RUBIX Launcher 2"
  CreateShortCut "$SMPROGRAMS\RUBIX Launcher 2\RUBIX Launcher.lnk" "$INSTDIR\rubix-launcher.exe"
  CreateShortCut "$SMPROGRAMS\RUBIX Launcher 2\Uninstall.lnk" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Rubix\NativeLauncher" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\RubixNativeLauncher" "DisplayName" "RUBIX Launcher 2 (Alpha)"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\RubixNativeLauncher" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\RubixNativeLauncher" "Publisher" "RUBIX"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\RubixNativeLauncher" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\RubixNativeLauncher" "DisplayIcon" "$INSTDIR\rubix-launcher.exe"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\RubixNativeLauncher" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\RubixNativeLauncher" "NoRepair" 1
SectionEnd

Section /o "Desktop shortcut"
  SetShellVarContext current
  CreateShortCut "$DESKTOP\RUBIX Launcher 2.lnk" "$INSTDIR\rubix-launcher.exe"
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  Delete "$DESKTOP\RUBIX Launcher 2.lnk"
  Delete "$SMPROGRAMS\RUBIX Launcher 2\RUBIX Launcher.lnk"
  Delete "$SMPROGRAMS\RUBIX Launcher 2\Uninstall.lnk"
  RMDir "$SMPROGRAMS\RUBIX Launcher 2"
  Delete "$INSTDIR\rubix-launcher.exe"
  Delete "$INSTDIR\LICENSE.txt"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\RubixNativeLauncher"
  DeleteRegKey HKCU "Software\Rubix\NativeLauncher"
  ; Application profiles, database, settings, logs and all game files are retained.
SectionEnd
