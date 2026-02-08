@echo off
cd /d "%~dp0"
echo ===================================================
echo     ARQUITECTO VIRTUAL - AUTO STARTUP
echo ===================================================
echo.
echo [1/2] Iniciando Watcher (Generador de Reportes)...
start "Watcher Backend" cmd /k "node watcher.js"

echo [2/2] Iniciando Servidor Web (Next.js)...
start "Web Server" cmd /k "npm run dev"

echo.
echo ===================================================
echo     SISTEMA INICIADO EXITOSAMENTE
echo ===================================================
echo.
echo La aplicacion estara lista en breve en: http://localhost:3000
echo.
pause
