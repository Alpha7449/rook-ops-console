// PowerShell / process helpers (Windows host control).
import { execFile, spawn } from "node:child_process";

export function runPs(command: string, timeoutMs = 20000): Promise<{ ok: boolean; out: string; err: string }> {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        resolve({ ok: !error, out: stdout?.toString() ?? "", err: stderr?.toString() ?? (error ? String(error) : "") });
      },
    );
  });
}

export function runCmd(file: string, args: string[], timeoutMs = 20000): Promise<{ ok: boolean; out: string; err: string }> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ ok: !error, out: stdout?.toString() ?? "", err: stderr?.toString() ?? (error ? String(error) : "") });
    });
  });
}

/**
 * Launch a process fully detached from this server (survives console restarts).
 * Used for launchers (Vexa, OBS) where the child must outlive us.
 */
export function spawnDetached(file: string, args: string[], cwd?: string, visible = false) {
  const child = spawn(file, args, {
    cwd,
    detached: true,
    stdio: "ignore",
    windowsHide: !visible,
  });
  child.unref();
  return child.pid;
}

/**
 * Launch via WMI so the child is parented to WmiPrvSE and survives ANY session
 * teardown (the same trick the Odysseus watchdog relies on).
 */
export async function spawnViaWmi(commandLine: string): Promise<boolean> {
  const escaped = commandLine.replace(/'/g, "''");
  const res = await runPs(`([wmiclass]'Win32_Process').Create('${escaped}') | Out-Null; $?`);
  return res.ok;
}

/** Kill whatever process owns a listening TCP port. */
export async function killByPort(port: number): Promise<boolean> {
  const res = await runPs(
    `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ` +
      `Select-Object -ExpandProperty OwningProcess -Unique | ` +
      `ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }`,
  );
  return res.ok;
}

/** Kill processes whose command line matches a substring (e.g. watchdog.ps1). */
export async function killByCommandLine(match: string): Promise<number> {
  const res = await runPs(
    `$pat = ${shatteredPattern(match)}; ` +
      `$procs = Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like $pat }; ` +
      `$n = ($procs | Measure-Object).Count; $procs | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; $n`,
  );
  const n = parseInt(res.out.trim(), 10);
  return Number.isFinite(n) ? n : 0;
}


const clrCache = new Map<string, { at: number; val: boolean }>();

/** commandLineRunning with a short TTL — for status polling, never for kill decisions. */
export async function cachedCommandLineRunning(match: string, ttlMs = 12000): Promise<boolean> {
  const hit = clrCache.get(match);
  if (hit && Date.now() - hit.at < ttlMs) return hit.val;
  const val = await commandLineRunning(match);
  clrCache.set(match, { at: Date.now(), val });
  return val;
}

/** Drop cached process answers (call after starting/stopping something). */
export function bustProcessCache() {
  clrCache.clear();
}

export async function processRunning(nameMatch: string): Promise<boolean> {
  const escaped = nameMatch.replace(/'/g, "''");
  const res = await runPs(`(Get-Process | Where-Object { $_.ProcessName -like '*${escaped}*' } | Measure-Object).Count`);
  return parseInt(res.out.trim(), 10) > 0;
}

/**
 * Build a PowerShell expression for `*match*` whose own source text can never be
 * matched by the pattern: every character is emitted as 'c'+'h'+'a'… so the
 * pattern literal never appears contiguously in ANY query's command line.
 * (Otherwise concurrent status queries match each other and report false "up".)
 */
export function shatteredPattern(match: string): string {
  const parts = [...match].map((ch) => `'${ch === "'" ? "''" : ch}'`);
  return `('*' + ${parts.join(" + ")} + '*')`;
}

export async function commandLineRunning(match: string): Promise<boolean> {
  const res = await runPs(
    `$pat = ${shatteredPattern(match)}; ` +
      `(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like $pat } | Measure-Object).Count`,
  );
  return parseInt(res.out.trim(), 10) > 0;
}
