@echo off
setlocal
cd /d "%~dp0"
where python >nul 2>&1
if errorlevel 1 (
  echo Python was not found. Install Python 3 or add it to PATH.
  pause
  exit /b 1
)
python --version
if errorlevel 1 (
  echo Python could not start. Check your Python installation.
  pause
  exit /b 1
)
python -c "import urllib.request,sys; r=urllib.request.urlopen('http://127.0.0.1:8001/',timeout=1); sys.exit(0 if b'FocusFlow' in r.read() else 1)" >nul 2>&1
if not errorlevel 1 (
  echo FocusFlow is already responding at http://127.0.0.1:8001/
  start "" "http://127.0.0.1:8001/"
  exit /b 0
)
echo FocusFlow will be available at http://127.0.0.1:8001/
echo Keep this window open while using the planner. Press Ctrl+C to stop it.
python -m http.server 8001 --bind 127.0.0.1
if errorlevel 1 echo Server exited with an error. Port 8001 may be unavailable.
pause
