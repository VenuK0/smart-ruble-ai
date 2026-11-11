@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul

if not exist ".venv\Scripts\python.exe" (
  echo SmartRubleAI: virtual environment is missing.
  echo Run these commands once from the project folder:
  echo   py -m venv .venv
  echo   .venv\Scripts\python.exe -m pip install -r requirements-dev.txt
  echo Then double-click launch-forum-demo.cmd again.
  pause
  exit /b 1
)

".venv\Scripts\python.exe" scripts\launch_forum_demo.py
if errorlevel 1 (
  echo.
  echo Demo startup failed. Check that the right v0.5 branch is selected.
  pause
  exit /b 1
)
endlocal
