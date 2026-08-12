# Keeps Read2Me running on the Windows server (port 3020) and picks up
# updates: every time the node process exits (crash, or you stop it on
# purpose), the loop pulls the latest code, reinstalls packages and starts
# it again. Same idea as the checklist app's update loop — it only ever
# touches ITS OWN node process (the one it started), never node in general.
#
# One-time install (PowerShell as administrator, adjust the path):
#   schtasks /Create /TN "Read2Me" /RU SYSTEM /SC ONSTART ^
#     /TR "powershell -NoProfile -ExecutionPolicy Bypass -File C:\apps\read2me\deploy\start-read2me.ps1"
#   schtasks /Run /TN "Read2Me"
#
# To update the app later: push to GitHub, then on the server stop only the
# port-3020 process — the loop restarts it with the new code:
#   Get-NetTCPConnection -LocalPort 3020 -State Listen |
#     ForEach-Object { Stop-Process -Id $_.OwningProcess }

$app = Split-Path $PSScriptRoot -Parent
Set-Location $app

while ($true) {
    git pull 2>&1 | Out-Null
    npm install --omit=dev 2>&1 | Out-Null
    node server.js
    Start-Sleep -Seconds 3
}
