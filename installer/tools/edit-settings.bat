@echo off
REM Opens the settings file (.env) in Notepad. Restart CampusStationery after saving.
cd /d "%~dp0.."
if not exist ".env" copy ".env.example" ".env" >nul
start "" notepad ".env"
