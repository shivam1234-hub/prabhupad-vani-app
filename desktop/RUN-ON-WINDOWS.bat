@echo off
REM ---------------------------------------------------------------------------
REM  Prabhupada Vani - run the desktop app from source on Windows.
REM
REM  Use this when the packaged .exe is blocked by SmartScreen or IT policy.
REM  Nothing here is a downloaded executable: npm fetches Electron and the app
REM  runs from this folder, so the reputation check never applies.
REM
REM  Requires Node.js 22+  ->  https://nodejs.org
REM ---------------------------------------------------------------------------
setlocal
cd /d "%~dp0.."

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js was not found on this machine.
  echo   Install the LTS build from https://nodejs.org then run this again.
  echo.
  pause
  exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do echo Using Node %%v

if not exist "node_modules\" (
  echo.
  echo   Installing project dependencies. First run only - this takes a few minutes.
  echo.
  call npm install || goto :failed
)

if not exist "desktop\node_modules\" (
  echo.
  echo   Installing Electron. First run only - about 100 MB.
  echo.
  call npm --prefix desktop install || goto :failed
)

if not exist "desktop\web\index.html" (
  echo.
  echo   Building the app bundle. First run only.
  echo.
  call npm --prefix desktop run export || goto :failed
)

echo.
echo   Starting Prabhupada Vani...
echo.
call npm --prefix desktop start
exit /b 0

:failed
echo.
echo   Something went wrong above. Scroll up for the actual error.
echo.
pause
exit /b 1
