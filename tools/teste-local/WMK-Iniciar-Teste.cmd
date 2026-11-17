@echo off
setlocal
cd /d "%~dp0"
echo ===========================================================
echo WMK Remote Support - Teste em um unico PC (sem Docker)
echo ===========================================================
echo Somente use este iniciador se voce baixou o kit do repositorio WMK.
echo A politica de execucao e alterada apenas neste processo PowerShell.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0WMK-Teste-Local.ps1"
if errorlevel 1 (
  echo.
  echo O laboratorio terminou com erro. Consulte os logs em dados-teste\logs.
  pause
)
endlocal
