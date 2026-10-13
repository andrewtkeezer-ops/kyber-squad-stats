# Installs the Kyber Squad agent as a Windows scheduled task:
#   - starts hidden when you log on (and right now)
#   - restarts automatically if it crashes
#   - logs to agent\data\agent.log
# Right-click this file -> "Run with PowerShell". Run it again any time; it replaces the task.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$vbs  = Join-Path $here 'run-hidden.vbs'
$name = 'Kyber Squad Agent'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Host 'node.exe not found on PATH - install Node.js first.' -ForegroundColor Red; Read-Host 'Press Enter'; exit 1 }
$action   = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$vbs`""
$trigger  = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Description 'Pushes Battlefront II squad stats from Kyber to the Cloudflare site.' | Out-Null
# stop any agent already running in a console window, then start the task
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*kyber-squad-stats*index.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-ScheduledTask -TaskName $name
Start-Sleep 3
$log = Join-Path (Split-Path $here -Parent) 'data\agent.log'
Write-Host "`nInstalled '$name'. It starts hidden at logon and restarts itself if it crashes." -ForegroundColor Green
Write-Host "Log: $log`n"
if (Test-Path $log) { Get-Content $log -Tail 5 }
Read-Host 'Press Enter to close'
