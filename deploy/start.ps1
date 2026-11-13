# Rook Ops - start the production server (idempotent).
#
#   powershell -ExecutionPolicy Bypass -File deploy\start.ps1
#
# Serves the current release (releases\<rev>, pointer in data\release.txt;
# falls back to .next\standalone for pre-release-dir builds) on
# http://127.0.0.1:7200.
# Spawn strategy: try WMI first (parents the server to WmiPrvSE so it survives
# the teardown of whatever shell/agent session ran this script); if WMI is not
# ready - which happens in the first seconds after logon - fall back to a
# plain hidden Start-Process. Every attempt is appended to data\boot.log.
#
# -Serve is internal: the spawned copy runs the actual node server.
param([switch]$Serve)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$port = 7200
$bootLog = Join-Path $root "data\boot.log"

function Boot-Log($msg) {
    try {
        New-Item -ItemType Directory -Force (Join-Path $root "data") | Out-Null
        ("[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg) | Out-File -Append -Encoding utf8 $bootLog
    } catch {}
}

function Resolve-ServeDir {
    $pointer = Join-Path $root "data\release.txt"
    if (Test-Path $pointer) {
        $rel = (Get-Content $pointer -First 1).Trim()
        if ($rel -and (Test-Path (Join-Path $rel "server.js"))) { return $rel }
        Boot-Log "release pointer stale ($rel) - falling back"
    }
    return (Join-Path $root ".next\standalone")
}

$serveDir = Resolve-ServeDir
$serverJs = Join-Path $serveDir "server.js"

if ($Serve) {
    # -- Inner mode: set env, run node in the foreground (hidden window) --
    Boot-Log ("inner: starting node from " + $serveDir)
    $env:ROOK_OPS_ROOT = $root
    $env:HOSTNAME = "127.0.0.1"
    $env:PORT = "$port"
    $env:NODE_ENV = "production"
    $envFile = Join-Path $root ".env.local"
    if (Test-Path $envFile) {
        foreach ($line in Get-Content $envFile) {
            if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
                [System.Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], "Process")
            }
        }
    }
    $log = Join-Path $root "data\server.log"
    Set-Location $serveDir
    $node = "node"
    try { $node = (Get-Command node -ErrorAction Stop).Source } catch { $node = "C:\Program Files\nodejs\node.exe" }
    & $node $serverJs 2>&1 | Out-File -Append -Encoding utf8 $log
    Boot-Log ("inner: node exited with " + $LASTEXITCODE)
    exit $LASTEXITCODE
}

# -- Outer mode: preflight, then spawn the inner server -----------------------
Boot-Log "outer: start requested"
$existing = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($existing) {
    Boot-Log "outer: already listening"
    Write-Host "Rook Ops already listening on :$port"
    exit 0
}
if (-not (Test-Path $serverJs)) {
    Boot-Log "outer: no build found"
    Write-Host "No production build found ($serverJs missing)." -ForegroundColor Yellow
    Write-Host "Run deploy\update.ps1 first."
    exit 1
}

$self = $MyInvocation.MyCommand.Path
$cmd = "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$self`" -Serve"

function Try-Spawn {
    try {
        $null = ([wmiclass]'Win32_Process').Create($cmd)
        Boot-Log "outer: spawned via WMI"
        return $true
    } catch {
        Boot-Log ("outer: WMI unavailable (" + $_.Exception.Message + "), falling back to Start-Process")
    }
    try {
        Start-Process powershell -WindowStyle Hidden -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-File",$self,"-Serve"
        Boot-Log "outer: spawned via Start-Process"
        return $true
    } catch {
        Boot-Log ("outer: Start-Process failed (" + $_.Exception.Message + ")")
        return $false
    }
}

for ($attempt = 1; $attempt -le 3; $attempt++) {
    if (-not (Try-Spawn)) { Start-Sleep -Seconds 5; continue }
    $deadline = (Get-Date).AddSeconds(40)
    while ((Get-Date) -lt $deadline) {
        if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
            Boot-Log "outer: server is up"
            Write-Host "Rook Ops up -> http://127.0.0.1:$port" -ForegroundColor Green
            exit 0
        }
        Start-Sleep -Milliseconds 800
    }
    Boot-Log ("outer: attempt " + $attempt + " timed out")
}
Boot-Log "outer: giving up after 3 attempts"
Write-Host "Server did not come up - check data\boot.log and data\server.log" -ForegroundColor Red
exit 1
