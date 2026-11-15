@echo off
REM Adds sample customers and orders so the dashboard and reports have data.
title CampusStationery sample data
cd /d "%~dp0.."
echo Adding sample customers and orders. MySQL must be running in XAMPP.
echo.
node scripts\demo-data.js
echo.
pause
