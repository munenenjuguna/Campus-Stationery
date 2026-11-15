@echo off
REM Resets admin@campusstationery.com to the password Admin@123 and removes a lost authenticator app.
title CampusStationery admin reset
cd /d "%~dp0.."
echo This resets admin@campusstationery.com to the password Admin@123.
echo MySQL must be running in XAMPP.
echo.
node scripts\reset-admin.js
echo.
pause
