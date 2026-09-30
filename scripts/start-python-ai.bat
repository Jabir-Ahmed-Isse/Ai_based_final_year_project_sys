@echo off
setlocal

if "%PORT%"=="" set "PORT=5002"
set "PYTHONUTF8=1"

cd /d "%~dp0..\python-ai\src"

python -u app.py 1> "%~dp0..\python-ai-service.log" 2> "%~dp0..\python-ai-service.err.log"
