@echo off
rem Restart the agent (e.g. after editing config.json)
powershell -NoProfile -Command "Stop-ScheduledTask -TaskName Kyber Squad Agent; Start-Sleep 1; Start-ScheduledTask -TaskName Kyber Squad Agent; Write-Host Agent restarted."
timeout /t 3 >nul
