@echo off
setlocal

cd /d "%~dp0"

powershell -ExecutionPolicy Bypass -File "%~dp0run-dev-with-api.ps1"
