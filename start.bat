@echo off
REM ==============================================================
REM  Starts CampusStationery and opens the shop in your browser.
REM  Keep this window open while you use the system. Close it to stop.
REM ==============================================================
title CampusStationery server
cd /d "%~dp0"

if not exist "node_modules" (
  echo Packages are missing. Running setup first...
  call setup.bat
)

echo Make sure MySQL is started in the XAMPP Control Panel.
echo.
start "" cmd /c "timeout /t 3 >nul && start http://localhost:5000 && start http://localhost:5000/admin/login.html"
node server.js
echo.
echo The server stopped. If you see an error above, read the message, fix it and run start.bat again.
pause
