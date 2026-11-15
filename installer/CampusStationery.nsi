; =====================================================================
;  CampusStationery Windows installer (installation wizard)
;  Built with NSIS 3 (nsis.sourceforge.io)
;
;  What it does:
;    1. Checks that Node.js is installed and offers the download page if not
;    2. Copies the system, with its packages, so no internet is needed
;    3. Asks for the MySQL port, password and database name, and writes .env
;    4. Adds Start menu and desktop shortcuts, and an uninstaller
;
;  To build it (see installer\README.md):
;    npm install --omit=dev      (in the project folder, once)
;    makensis installer\CampusStationery.nsi
;  The setup file is written to the dist folder.
; =====================================================================

Unicode true

!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"

!define APP_NAME "CampusStationery"
!define APP_VERSION "1.0.0"
!define PUBLISHER "CampusStationery Project Team"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\CampusStationery"

; Folder holding the project files. Defaults to the project folder above this script.
!ifndef SOURCE
  !define SOURCE ".."
!endif

Name "${APP_NAME}"
OutFile "..\dist\CampusStationery-Setup-${APP_VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\CampusStationery"
InstallDirRegKey HKCU "Software\CampusStationery" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
BrandingText "CampusStationery ${APP_VERSION}"
ShowInstDetails show

VIProductVersion "1.0.0.0"
VIAddVersionKey "ProductName" "${APP_NAME}"
VIAddVersionKey "FileDescription" "CampusStationery online shop and admin panel setup"
VIAddVersionKey "FileVersion" "${APP_VERSION}"
VIAddVersionKey "ProductVersion" "${APP_VERSION}"
VIAddVersionKey "CompanyName" "${PUBLISHER}"
VIAddVersionKey "LegalCopyright" "${PUBLISHER}"

; ---------------- look and feel ----------------

!define MUI_ICON "campus.ico"
!define MUI_UNICON "campus.ico"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_RIGHT
!define MUI_HEADERIMAGE_BITMAP "header.bmp"
!define MUI_HEADERIMAGE_UNBITMAP "header.bmp"
!define MUI_WELCOMEFINISHPAGE_BITMAP "welcome.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "welcome.bmp"
!define MUI_ABORTWARNING

; ---------------- pages ----------------

!define MUI_WELCOMEPAGE_TITLE "Welcome to the CampusStationery setup"
!define MUI_WELCOMEPAGE_TEXT "This wizard installs CampusStationery: the online stationery shop, the admin panel and everything they need to run.$\r$\n$\r$\nBefore you continue, make sure you have:$\r$\n$\r$\n   1.  Node.js (LTS version) from nodejs.org$\r$\n   2.  XAMPP, with MySQL started in the XAMPP Control Panel$\r$\n$\r$\nYou do not need to import any SQL file. The database and its tables are created automatically the first time CampusStationery starts.$\r$\n$\r$\nClick Next to continue."
!insertmacro MUI_PAGE_WELCOME

!define MUI_DIRECTORYPAGE_TEXT_TOP "CampusStationery will be installed in this folder. You do not need administrator rights for the folder shown."
!insertmacro MUI_PAGE_DIRECTORY

Page custom DatabasePage DatabasePageLeave

!insertmacro MUI_PAGE_INSTFILES

!define MUI_FINISHPAGE_TITLE "CampusStationery is installed"
!define MUI_FINISHPAGE_TEXT "Start MySQL in XAMPP, then open CampusStationery from the desktop or the Start menu. Keep its server window open while you use it.$\r$\n$\r$\nFirst admin sign in: see section 2.5 of the user manual."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Start CampusStationery now"
!define MUI_FINISHPAGE_RUN_FUNCTION StartApp
!define MUI_FINISHPAGE_SHOWREADME
!define MUI_FINISHPAGE_SHOWREADME_TEXT "Open the user manual"
!define MUI_FINISHPAGE_SHOWREADME_FUNCTION OpenManual
!define MUI_FINISHPAGE_SHOWREADME_NOTCHECKED
!insertmacro MUI_PAGE_FINISH

!define MUI_UNCONFIRMPAGE_TEXT_TOP "CampusStationery will be removed from this folder. Your MySQL database and its data are not touched, so you can install again later and carry on."
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

; ---------------- variables ----------------

Var Dialog
Var PortField
Var PassField
Var NameField
Var DbPort
Var DbPass
Var DbName

; ---------------- start up checks ----------------

Function .onInit
  StrCpy $DbPort "3306"
  StrCpy $DbPass ""
  StrCpy $DbName "school_project_db"

  ; Node.js runs the system. "node -v" fails when it is missing.
  nsExec::ExecToStack 'cmd /c node -v'
  Pop $0
  Pop $1
  ${If} $0 != 0
    MessageBox MB_YESNO|MB_ICONQUESTION "Node.js was not found on this computer. CampusStationery needs Node.js 18 or newer.$\r$\n$\r$\nClick Yes to open the Node.js download page. Install the LTS version, then run this setup again.$\r$\n$\r$\nClick No to install anyway and add Node.js later." /SD IDNO IDNO carryOn
    ExecShell "open" "https://nodejs.org/en/download"
    Abort
  ${EndIf}
  carryOn:
FunctionEnd

; ---------------- database settings page ----------------

Function DatabasePage
  ; Reinstalling over an earlier copy keeps its settings, so the page is skipped
  ${If} ${FileExists} "$INSTDIR\.env"
    Abort
  ${EndIf}

  !insertmacro MUI_HEADER_TEXT "Database settings" "Tell CampusStationery how to reach MySQL in XAMPP."
  nsDialogs::Create 1018
  Pop $Dialog
  ${If} $Dialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 26u "Open phpMyAdmin at http://localhost/phpmyadmin. The top of the page shows Server: 127.0.0.1:XXXX. The number XXXX is your MySQL port, usually 3306 or 3308."
  Pop $0

  ${NSD_CreateLabel} 0 34u 32% 12u "MySQL port:"
  Pop $0
  ; A number box: Windows itself refuses letters here (key trapping)
  ${NSD_CreateNumber} 34% 32u 22% 13u "$DbPort"
  Pop $PortField
  ${NSD_Edit_SetTextLimit} $PortField 5

  ${NSD_CreateLabel} 0 54u 32% 12u "MySQL root password:"
  Pop $0
  ${NSD_CreatePassword} 34% 52u 50% 13u "$DbPass"
  Pop $PassField
  ${NSD_CreateLabel} 34% 67u 66% 10u "Leave empty if you never set one (the XAMPP default)."
  Pop $0

  ${NSD_CreateLabel} 0 84u 32% 12u "Database name:"
  Pop $0
  ${NSD_CreateText} 34% 82u 50% 13u "$DbName"
  Pop $NameField
  ${NSD_Edit_SetTextLimit} $NameField 60

  ${NSD_CreateLabel} 0 106u 100% 30u "These settings are saved in the .env file in the install folder. To change them later, use Start menu, CampusStationery, Edit settings."
  Pop $0

  nsDialogs::Show
FunctionEnd

Function DatabasePageLeave
  ${NSD_GetText} $PortField $DbPort
  ${NSD_GetText} $PassField $DbPass
  ${NSD_GetText} $NameField $DbName

  ${If} $DbPort == ""
    StrCpy $DbPort "3306"
  ${EndIf}
  ${If} $DbPort < 1
  ${OrIf} $DbPort > 65535
    MessageBox MB_ICONEXCLAMATION "Please enter a port number between 1 and 65535, for example 3306."
    Abort
  ${EndIf}
  ${If} $DbName == ""
    StrCpy $DbName "school_project_db"
  ${EndIf}
  ; A single quote would end the quoted password in .env early
  Push $DbPass
  Push "'"
  Call StrContains
  Pop $0
  ${If} $0 != ""
    MessageBox MB_ICONEXCLAMATION "The password cannot contain a single quote ( ' ) here. Install with an empty password, then type the real one in the .env file with Notepad."
    Abort
  ${EndIf}
FunctionEnd

; Returns the needle if the haystack contains it, otherwise an empty string
Function StrContains
  Exch $R1 ; needle
  Exch
  Exch $R2 ; haystack
  Push $R3
  Push $R4
  Push $R5
  StrLen $R3 $R1
  StrCpy $R4 0
  StrCpy $R5 ""
  loop:
    StrCpy $0 $R2 $R3 $R4
    StrCmp $0 "" done
    StrCmp $0 $R1 found
    IntOp $R4 $R4 + 1
    Goto loop
  found:
    StrCpy $R5 $R1
  done:
  StrCpy $R1 $R5
  Pop $R5
  Pop $R4
  Pop $R3
  Pop $R2
  Exch $R1
FunctionEnd

; ---------------- install ----------------

Section "CampusStationery" SecMain
  SectionIn RO
  SetOutPath "$INSTDIR"

  DetailPrint "Copying CampusStationery and its packages..."
  ; Each folder is listed by name. (A general exclude such as "dist" would also drop
  ; folders with that name inside node_modules, which the packages need.)
  File /r "${SOURCE}\admin"
  File /r "${SOURCE}\assets"
  File /r "${SOURCE}\config"
  File /r "${SOURCE}\css"
  File /r "${SOURCE}\database"
  File /r "${SOURCE}\docs"
  File /r "${SOURCE}\js"
  File /r "${SOURCE}\middleware"
  File /r "${SOURCE}\node_modules"
  File /r "${SOURCE}\pages"
  File /r "${SOURCE}\routes"
  File /r "${SOURCE}\scripts"
  File /r "${SOURCE}\services"
  File /r "${SOURCE}\utils"
  File "${SOURCE}\server.js"
  File "${SOURCE}\index.html"
  File "${SOURCE}\package.json"
  File "${SOURCE}\package-lock.json"
  File "${SOURCE}\README.md"
  File "${SOURCE}\setup.bat"
  File "${SOURCE}\start.bat"
  File "${SOURCE}\.env.example"

  SetOutPath "$INSTDIR\tools"
  File "tools\add-sample-data.bat"
  File "tools\reset-admin-password.bat"
  File "tools\edit-settings.bat"
  SetOutPath "$INSTDIR"
  File "campus.ico"

  ; Settings file. An existing one is kept, so reinstalling never loses your settings.
  ${IfNot} ${FileExists} "$INSTDIR\.env"
    DetailPrint "Saving database settings to .env"
    FileOpen $0 "$INSTDIR\.env" w
    FileWrite $0 "# CampusStationery settings, written by the installer$\r$\n"
    FileWrite $0 "PORT=5000$\r$\n"
    FileWrite $0 "DB_HOST=127.0.0.1$\r$\n"
    FileWrite $0 "DB_PORT=$DbPort$\r$\n"
    FileWrite $0 "DB_USER=root$\r$\n"
    FileWrite $0 "DB_PASSWORD='$DbPass'$\r$\n"
    FileWrite $0 "DB_NAME=$DbName$\r$\n"
    FileClose $0
  ${EndIf}

  ; Shortcuts
  DetailPrint "Adding shortcuts"
  CreateDirectory "$SMPROGRAMS\CampusStationery"
  CreateShortCut "$SMPROGRAMS\CampusStationery\Start CampusStationery.lnk" "$INSTDIR\start.bat" "" "$INSTDIR\campus.ico" 0
  WriteINIStr "$SMPROGRAMS\CampusStationery\Open the shop.url" "InternetShortcut" "URL" "http://localhost:5000"
  WriteINIStr "$SMPROGRAMS\CampusStationery\Open the admin panel.url" "InternetShortcut" "URL" "http://localhost:5000/admin/login.html"
  CreateShortCut "$SMPROGRAMS\CampusStationery\User manual.lnk" "$INSTDIR\docs\CampusStationery_User_Manual.pdf"
  CreateShortCut "$SMPROGRAMS\CampusStationery\Add sample data.lnk" "$INSTDIR\tools\add-sample-data.bat" "" "$INSTDIR\campus.ico" 0
  CreateShortCut "$SMPROGRAMS\CampusStationery\Reset admin password.lnk" "$INSTDIR\tools\reset-admin-password.bat" "" "$INSTDIR\campus.ico" 0
  CreateShortCut "$SMPROGRAMS\CampusStationery\Edit settings.lnk" "$INSTDIR\tools\edit-settings.bat"
  CreateShortCut "$SMPROGRAMS\CampusStationery\Uninstall CampusStationery.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortCut "$DESKTOP\CampusStationery.lnk" "$INSTDIR\start.bat" "" "$INSTDIR\campus.ico" 0

  ; Uninstaller, listed in Settings, Apps
  WriteRegStr HKCU "Software\CampusStationery" "InstallDir" "$INSTDIR"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "CampusStationery"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "${PUBLISHER}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\campus.ico"
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "${UNINST_KEY}" "EstimatedSize" "$0"
SectionEnd

Function StartApp
  ExecShell "open" "$INSTDIR\start.bat"
FunctionEnd

Function OpenManual
  ExecShell "open" "$INSTDIR\docs\CampusStationery_User_Manual.pdf"
FunctionEnd

; ---------------- uninstall ----------------
; Only removes what the installer added, never a whole folder chosen by mistake.

Section "Uninstall"
  Delete "$DESKTOP\CampusStationery.lnk"
  RMDir /r "$SMPROGRAMS\CampusStationery"

  RMDir /r "$INSTDIR\admin"
  RMDir /r "$INSTDIR\assets"
  RMDir /r "$INSTDIR\config"
  RMDir /r "$INSTDIR\css"
  RMDir /r "$INSTDIR\database"
  RMDir /r "$INSTDIR\docs"
  RMDir /r "$INSTDIR\js"
  RMDir /r "$INSTDIR\middleware"
  RMDir /r "$INSTDIR\node_modules"
  RMDir /r "$INSTDIR\pages"
  RMDir /r "$INSTDIR\routes"
  RMDir /r "$INSTDIR\scripts"
  RMDir /r "$INSTDIR\services"
  RMDir /r "$INSTDIR\tools"
  RMDir /r "$INSTDIR\utils"
  Delete "$INSTDIR\*.js"
  Delete "$INSTDIR\*.json"
  Delete "$INSTDIR\*.html"
  Delete "$INSTDIR\*.md"
  Delete "$INSTDIR\*.bat"
  Delete "$INSTDIR\campus.ico"
  Delete "$INSTDIR\.env"
  Delete "$INSTDIR\.env.example"
  Delete "$INSTDIR\.app-secret"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"

  DeleteRegKey HKCU "${UNINST_KEY}"
  DeleteRegKey HKCU "Software\CampusStationery"
SectionEnd
