@echo off
rem Remove the scheduled task (stops auto-start)
powershell -NoProfile -Command "Stop-ScheduledTask -TaskName Kyber Squad Agent -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName Kyber Squad Agent -Confirm:$false; Write-Host Removed."
timeout /t 3 >nul
