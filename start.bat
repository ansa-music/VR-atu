@echo off
cd /d "%~dp0"
echo VR Tir: http://localhost:8000  (Ctrl+C - stop)
start "" http://localhost:8000
python -m http.server 8000
