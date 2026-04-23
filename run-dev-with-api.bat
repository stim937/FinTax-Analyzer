@echo off
setlocal

cd /d "%~dp0"

echo [FinTax Analyzer] Starting Vercel API on http://127.0.0.1:3000
start "FinTax API" cmd /k "npm run dev:api"

timeout /t 3 /nobreak >nul

echo [FinTax Analyzer] Starting Vite app on http://127.0.0.1:5173
start "FinTax App" cmd /k "npm run dev:app"

echo.
echo Both local servers have been started.
echo - App: http://127.0.0.1:5173
echo - API: http://127.0.0.1:3000
echo.
