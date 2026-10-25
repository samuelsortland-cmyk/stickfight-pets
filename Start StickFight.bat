@echo off
title StickFight Pets
cd /d "%~dp0"
where npm >nul 2>nul || (echo Node.js is not installed. Get the LTS version from https://nodejs.org and run this again. & pause & exit /b 1)
if not exist node_modules\electron (
  echo First run: installing, this takes a minute...
  call npm install --no-audit --no-fund || (pause & exit /b 1)
)
start "StickFight Pets" /min cmd /c "npm start"
exit /b 0
