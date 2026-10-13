@echo off
rem Show the last 30 lines of the agent log (and keep following it)
cd /d "%~dp0.."
powershell -NoProfile -Command "Get-Content data\agent.log -Tail 30 -Wait"
