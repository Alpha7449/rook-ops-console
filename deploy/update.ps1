# Rook Ops - one-command deploy.
#
#   powershell -ExecutionPolicy Bypass -File deploy\update.ps1          # pull + build + restart
#   powershell -ExecutionPolicy Bypass -File deploy\update.ps1 -NoPull  # build + restart local tree
#
# Pull latest -> install deps -> production build -> copy into a versioned
# releases\<rev>-<stamp> folder -> swap the release pointer -> restart on
# :7200. The server always runs from a release COPY, never from .next, so
# Windows file locks can never break the next build, and a failed build
# leaves the running release untouched. Keeps the last 3 releases.
param([switch]$NoPull)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root
$port = 7200

function Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }

# Legacy migration: if a server is still running straight out of .next\standalone
# (pre-release-dir deploys), its file locks would break the build - stop it once.
$pointer = Join-Path $root "data\release.txt"
$portUp = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($portUp -and -not (Test-Path $pointer)) {
    Step "stopping legacy in-place server (locks .next)"
    $portUp | Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 500
}

if (-not $NoPull) {
    Step "git pull --ff-only"
    git pull --ff-only
    if ($LASTEXITCODE -ne 0) { Write-Host "Pull failed (diverged? dirty tree?) - resolve and re-run." -ForegroundColor Red; exit 1 }
}

Step "pnpm install --frozen-lockfile"
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { exit 1 }

Step "pnpm build (standalone)"
pnpm build
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed - the running release was left untouched." -ForegroundColor Red; exit 1 }

$rev = (git rev-parse --short HEAD).Trim()
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$release = Join-Path $root ("releases\" + $rev + "-" + $stamp)
Step "assemble release $rev-$stamp"
# MOVE the standalone dir (instant rename, keeps pnpm's symlinked node_modules
# intact - Copy-Item silently breaks those links and the server dies on boot
# with missing modules). next build recreates .next from scratch anyway.
New-Item -ItemType Directory -Force (Join-Path $root "releases") | Out-Null
Move-Item -Force ".next\standalone" $release
New-Item -ItemType Directory -Force (Join-Path $release ".next") | Out-Null
Copy-Item -Recurse -Force ".next\static" (Join-Path $release ".next\static")
if (Test-Path "public") { Copy-Item -Recurse -Force "public" (Join-Path $release "public") }

Step "swap release + restart on :$port"
Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 500
New-Item -ItemType Directory -Force (Join-Path $root "data") | Out-Null
Set-Content -Path $pointer -Value $release -Encoding utf8

& (Join-Path $PSScriptRoot "start.ps1")
if ($LASTEXITCODE -ne 0) { exit 1 }

# Prune old releases, keep newest 3 (the active one is always among them).
$all = Get-ChildItem (Join-Path $root "releases") -Directory -ErrorAction SilentlyContinue |
    Sort-Object CreationTime -Descending
if ($all -and $all.Count -gt 3) {
    $all | Select-Object -Skip 3 | ForEach-Object {
        Remove-Item -Recurse -Force $_.FullName -ErrorAction SilentlyContinue
    }
}

Write-Host "Deployed $rev -> http://127.0.0.1:$port" -ForegroundColor Green
