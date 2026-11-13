# Rook Ops — one-time install: autostart at logon + an app-window shortcut.
#
#   powershell -ExecutionPolicy Bypass -File deploy\install.ps1
#
# - HKCU Run key "RookOps" starts the server (hidden) at every logon — same
#   pattern as the Odysseus watchdog's "OdysseusStack" key.
# - A "Rook Ops" shortcut (Desktop + Start Menu) opens the console as an Edge
#   app window: no tabs, no address bar — feels like a native app.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$startPs1 = Join-Path $root "deploy\start.ps1"

# Autostart at logon (idempotent overwrite)
$runCmd = "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$startPs1`""
Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "RookOps" -Value $runCmd
Write-Host "Autostart registered (HKCU Run key 'RookOps')."

# Edge app-window shortcut
$edge = @(
    "$env:ProgramFiles (x86)\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { Write-Host "Edge not found — skipping shortcuts."; exit 0 }

$icon = Join-Path $root "deploy\rook.ico"
$shell = New-Object -ComObject WScript.Shell
foreach ($dir in @([Environment]::GetFolderPath("Desktop"),
                   (Join-Path ([Environment]::GetFolderPath("StartMenu")) "Programs"))) {
    $lnk = $shell.CreateShortcut((Join-Path $dir "Rook Ops.lnk"))
    $lnk.TargetPath = "powershell.exe"
    $lnk.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$root\deploy\open.ps1`""
    $lnk.WorkingDirectory = $root
    if (Test-Path $icon) { $lnk.IconLocation = $icon }
    $lnk.Description = "Rook Ops — AI workflow control plane"
    $lnk.Save()
}
Write-Host "Shortcuts created (Desktop + Start Menu)."
Write-Host "Done. The server itself starts via deploy\start.ps1 (or next logon)."
