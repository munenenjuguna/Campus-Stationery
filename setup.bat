@echo off
REM ==============================================================
REM  CampusStationery one click setup for Windows (XAMPP)
REM  1. Checks Node.js   2. Installs packages   3. Creates .env
REM  The database and tables are created automatically on first start.
REM ==============================================================
title CampusStationery setup
cd /d "%~dp0"

echo.
echo  CampusStationery setup
echo  ======================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js is not installed. Download the LTS version from https://nodejs.org
  echo  install it, then run this file again.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do echo  Node.js %%v found.

echo.
echo  Installing packages (this needs internet the first time)...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo  npm install failed. Check your internet connection and try again.
  pause
  exit /b 1
)

if exist ".env" (
  echo.
  echo  A .env file already exists, so your settings were kept.
) else (
  echo.
  echo  Let us create your settings file .env
  echo  Look at the top of phpMyAdmin: "Server: 127.0.0.1:XXXX". XXXX is the port.
  set /p DBPORT="  MySQL port [3306]: "
  set /p DBPASS="  MySQL root password (press Enter if none): "
  call :writeenv
  echo  .env created.
)

echo.
echo  Setup complete.
echo  1. Start MySQL in the XAMPP Control Panel.
echo  2. Double click start.bat to run the system.
echo.
pause
exit /b 0

:writeenv
if "%DBPORT%"=="" set DBPORT=3306
(
  echo PORT=5000
  echo DB_HOST=127.0.0.1
  echo DB_PORT=%DBPORT%
  echo DB_USER=root
  echo DB_PASSWORD=%DBPASS%
  echo DB_NAME=school_project_db
) > .env
exit /b 0
