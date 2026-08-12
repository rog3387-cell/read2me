# ============================================================================
# setup-domain.ps1 - put https://read2me.megadistribution.al on this server
# ----------------------------------------------------------------------------
# The server runs ONE Caddy (the Windows service "Caddy") answering every
# https name on the box. Each app registers its own name by dropping a file
# into C:\caddy\sites\ - this script does exactly that for Read2Me and
# NOTHING else. It never touches other apps' domains:
#   1. installs deploy\read2me.caddy as C:\caddy\sites\read2me.caddy
#   2. makes sure C:\caddy\Caddyfile has the one shared
#      "import C:\caddy\sites\*.caddy" line (adds it if missing, with backup)
#   3. validates the config and restarts the Caddy service
#      (rolls everything back if validation fails - nothing is restarted)
#
# Before running: the DNS record read2me.megadistribution.al must point at
# this server, and the app should be running on port 3020.
#
# Run in an ADMINISTRATOR PowerShell from the app folder:
#   powershell -ExecutionPolicy Bypass -File .\deploy\setup-domain.ps1
# ============================================================================

$ErrorActionPreference = 'Stop'
$scriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$caddyfile  = 'C:\caddy\Caddyfile'
$sitesDir   = 'C:\caddy\sites'
$siteFile   = Join-Path $sitesDir 'read2me.caddy'
$importLine = 'import C:\caddy\sites\*.caddy'

# --- must be Administrator ---------------------------------------------------
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
           ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Write-Host 'Please run this in an ADMINISTRATOR PowerShell.' -ForegroundColor Red; exit 1 }

# --- the one Caddy must already exist as the Windows service "Caddy" ---------
$svc = Get-Service -Name Caddy -ErrorAction SilentlyContinue
if (-not $svc) {
  Write-Host 'The "Caddy" Windows service was not found on this machine.' -ForegroundColor Red
  Write-Host 'This script only updates the existing service. Ask Claude before installing anything new.' -ForegroundColor Yellow
  exit 1
}

# --- if the shared Caddyfile itself already defines this name, stop:
#     defining the same site twice would make the whole config invalid --------
if (Select-String -Path $caddyfile -Pattern 'read2me\.megadistribution\.al' -Quiet) {
  Write-Host 'read2me.megadistribution.al is already configured inside C:\caddy\Caddyfile itself.'
  Write-Host 'Nothing to do - the domain should already work. (If you are moving it to the'
  Write-Host 'per-app model, first apply the checklist repo''s updated Caddyfile - which no'
  Write-Host 'longer contains the read2me block - then run this script again.)'
  exit 0
}

# --- install this app's site file --------------------------------------------
New-Item -ItemType Directory -Force -Path $sitesDir | Out-Null
Copy-Item "$scriptDir\read2me.caddy" $siteFile -Force

# --- make sure the shared Caddyfile imports the sites folder -----------------
Copy-Item $caddyfile "$caddyfile.bak" -Force
$touchedMain = $false
if (-not (Select-String -Path $caddyfile -SimpleMatch $importLine -Quiet)) {
  $touchedMain = $true
  Add-Content -Path $caddyfile -Value "`r`n# Per-app site configs - each app's own repo installs its file here`r`n$importLine"
}

# --- validate; roll back on failure ------------------------------------------
& 'C:\caddy\caddy.exe' validate --config $caddyfile
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Config INVALID - rolling back; nothing was restarted, all domains unchanged.' -ForegroundColor Red
  if ($touchedMain) { Copy-Item "$caddyfile.bak" $caddyfile -Force }
  Remove-Item $siteFile -Force -ErrorAction SilentlyContinue
  exit 1
}

Restart-Service Caddy
Start-Sleep -Seconds 3
Write-Host ''
Write-Host ('Caddy service: ' + (Get-Service Caddy).Status)
Write-Host 'Done. https://read2me.megadistribution.al should answer within a minute.' -ForegroundColor Green
