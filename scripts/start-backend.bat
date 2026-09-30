@echo off
setlocal

cd /d "%~dp0..\backend"

npm.cmd run dev
