# Rook Ops - what the desktop shortcut runs: make sure the server is up
# (idempotent, instant when already running), then open the app window.
# This makes the shortcut self-healing: even if autostart failed, clicking
# the icon brings the whole thing up.
$ErrorActionPreference = "SilentlyContinue"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

& (Join-Path $here "start.ps1")

$edge = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($edge) {
    Start-Process $edge -ArgumentList "--app=http://127.0.0.1:7200/"
} else {
    Start-Process "http://127.0.0.1:7200/"
}
