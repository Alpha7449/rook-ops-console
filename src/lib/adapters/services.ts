// Service liveness + start/stop, and the gaming-mode orchestration.
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { appRoot, getConfig, DEMO } from "../config";
import { checkPort } from "../net";
import { bustProcessCache, cachedCommandLineRunning, killByCommandLine, killByPort, runCmd, runPs, spawnViaWmi } from "../ps";
import { SERVICES, serviceById } from "../registry";
import type { ServiceState } from "../types";
import { demoServiceStates } from "../demo";
import { ollamaDetail, startOllama, stopOllama, unloadAllModels } from "./ollama";
import { getSystemStats } from "./system";
import { addRun, finishRun, kvGet, kvSet, logAudit } from "../db/repo";

// Transient states so the UI shows "starting…" between poller ticks.
const g = globalThis as unknown as { __rkTransient?: Map<string, ServiceState>; __rkGamingBusy?: boolean };
const transient = () => (g.__rkTransient ??= new Map<string, ServiceState>());

export function setTransient(id: string, state: ServiceState | null) {
  if (state) transient().set(id, state);
  else transient().delete(id);
}

function psScript(file: string): string {
  const win = file.replace(/\//g, "\\");
  return `powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "${win}"`;
}

/**
 * Gaming-mode flag file. The watchdog loop, the stack script and the 30-min
 * revival task all honor it: while it exists, nothing revives the stack. This
 * lets the watchdog STAY ALIVE during gaming (idling with a "gaming hold"
 * heartbeat) instead of being killed - and restore is instant on exit.
 * The watchdog treats flags older than 12h as stale and clears them.
 */
const gamingFlag = () => path.join(appRoot(), "data", "gaming-mode.flag");

function setGamingFlag(on: boolean) {
  try {
    if (on) {
      fs.mkdirSync(path.join(appRoot(), "data"), { recursive: true });
      fs.writeFileSync(gamingFlag(), new Date().toISOString());
    } else {
      fs.rmSync(gamingFlag(), { force: true });
    }
  } catch {
    // flag write failure surfaces via the watchdog reviving things; audited below
  }
}

export const gamingFlagPresent = () => fs.existsSync(gamingFlag());

async function watchdogState(): Promise<ServiceState> {
  const cfg = getConfig();
  const running = await cachedCommandLineRunning("watchdog.ps1");
  if (!running) return { status: "down" };
  try {
    const hb = path.join(cfg.paths.odysseusDir, "logs", "watchdog-heartbeat.txt");
    const age = (Date.now() - fs.statSync(hb).mtimeMs) / 1000;
    const hold = gamingFlagPresent() ? " · gaming hold" : "";
    if (age > 180) return { status: "up", detail: `heartbeat STALE (${Math.round(age / 60)} min)${hold}` };
    return { status: "up", detail: `heartbeat ${Math.round(age)}s ago${hold}` };
  } catch {
    return { status: "up", detail: "no heartbeat file yet" };
  }
}

export async function serviceStates(): Promise<Record<string, ServiceState>> {
  if (DEMO) return structuredClone(demoServiceStates);
  const out: Record<string, ServiceState> = {};
  await Promise.all(
    SERVICES.map(async (s) => {
      if (transient().has(s.id)) {
        out[s.id] = transient().get(s.id)!;
        return;
      }
      if (s.id === "watchdog") {
        out[s.id] = await watchdogState();
      } else if (s.port) {
        const up = await checkPort(s.port);
        out[s.id] = { status: up ? "up" : "down" };
        if (s.id === "ollama" && up) out[s.id].detail = await ollamaDetail();
      } else {
        out[s.id] = { status: "unknown" };
      }
    }),
  );
  return out;
}

// ── Start / stop per service ────────────────────────────────────────────────

async function dockerCtl(container: string, action: "start" | "stop") {
  return runCmd("docker", [action, container], 60000);
}

/** SearXNG's container name comes from the odysseus compose project — find by name match. */
async function searxngContainer(): Promise<string | null> {
  const res = await runCmd("docker", ["ps", "-a", "--format", "{{.Names}}"], 15000);
  if (!res.ok) return null;
  return res.out.split("\n").find((n) => n.toLowerCase().includes("searxng"))?.trim() ?? null;
}

export async function startService(id: string): Promise<void> {
  if (DEMO) {
    demoServiceStates[id] = { status: "up" };
    return;
  }
  const cfg = getConfig();
  setTransient(id, { status: "starting" });
  try {
    switch (id) {
      case "watchdog":
        await spawnViaWmi(psScript(path.join(cfg.paths.odysseusDir, "watchdog.ps1")));
        bustProcessCache();
        break;
      case "odysseus":
        // start-odysseus-stack.ps1 is idempotent (brings up Chroma/Ollama/Odysseus if down).
        await spawnViaWmi(psScript(path.join(cfg.paths.odysseusDir, "start-odysseus-stack.ps1")));
        break;
      case "chroma": {
        const task = cfg.chromaScheduledTask.replace(/'/g, "''");
        const res = await runPs(`Start-ScheduledTask -TaskName '${task}'; $?`);
        if (!res.ok || !res.out.includes("True")) {
          await spawnViaWmi(psScript(cfg.paths.chromaStartScript) + " -Foreground");
        }
        break;
      }
      case "ollama":
        await startOllama();
        break;
      case "n8n":
        await dockerCtl("n8n", "start");
        break;
      case "searxng": {
        const name = await searxngContainer();
        if (name) await dockerCtl(name, "start");
        break;
      }
    }
    await logAudit("service.start", id);
  } finally {
    // Let the poller take over once the port answers; clear after a grace window.
    setTimeout(() => setTransient(id, null), 25000);
  }
}

export async function stopService(id: string): Promise<void> {
  if (DEMO) {
    demoServiceStates[id] = { status: "down" };
    return;
  }
  const svc = serviceById(id);
  setTransient(id, { status: "stopping" });
  try {
    switch (id) {
      case "watchdog":
        await killByCommandLine("watchdog.ps1");
        bustProcessCache();
        break;
      case "ollama":
        await stopOllama();
        break;
      case "n8n":
        await dockerCtl("n8n", "stop");
        break;
      case "searxng": {
        const name = await searxngContainer();
        if (name) await dockerCtl(name, "stop");
        break;
      }
      default:
        if (svc?.port) await killByPort(svc.port);
    }
    await logAudit("service.stop", id);
  } finally {
    setTimeout(() => setTransient(id, null), 8000);
  }
}


/**
 * Containers stopped explicitly (gaming mode does `docker stop`) are NOT
 * auto-restarted by Docker's `unless-stopped` policy after a reboot. Once per
 * server process, and only within the first 15 minutes of system uptime (i.e.
 * a real boot), bring them back — unless gaming mode is intentionally on.
 */
export async function bootReconcile(): Promise<void> {
  if (DEMO) return;
  if (os.uptime() > 900) return;
  const gaming = await gamingState();
  if (gaming.active || gaming.busy) return;
  for (const id of ["n8n", "searxng"] as const) {
    const svc = serviceById(id);
    if (svc?.port && !(await checkPort(svc.port))) {
      await logAudit("boot.reconcile", id, "container down after reboot - starting");
      await startService(id);
    }
  }
}

// ── Gaming mode ─────────────────────────────────────────────────────────────

const GAMING_KEY = "gaming";
const busyFlag = () => g.__rkGamingBusy === true;

export async function gamingState(): Promise<{ active: boolean; busy: boolean; lastReport?: string }> {
  const raw = await kvGet(GAMING_KEY);
  const parsed = raw ? (JSON.parse(raw) as { active: boolean; lastReport?: string }) : { active: false };
  return { ...parsed, busy: busyFlag() };
}

/**
 * Enter gaming mode: kill the watchdog FIRST (it resurrects everything within
 * 60s otherwise), then stop each VRAM/RAM consumer, then report what was freed.
 * Docker Desktop itself is left alone — its restart path is flaky on this box.
 */
export async function enterGamingMode(): Promise<string> {
  if (DEMO) {
    for (const s of SERVICES) demoServiceStates[s.id] = { status: "down" };
    const report = "Freed 9.6 GB VRAM · stopped 6 services (demo)";
    await kvSet(GAMING_KEY, JSON.stringify({ active: true, lastReport: report }));
    return report;
  }
  g.__rkGamingBusy = true;
  const runId = `gaming-${Date.now()}`;
  const started = Date.now();
  await addRun({ id: runId, workflowId: "system", ts: started, trigger: "Gaming mode ON", result: "run", source: "console" });
  try {
    const before = await getSystemStats();
    const lines: string[] = [];

    // Flag FIRST: watchdog + stack script + revival task all honor it, so the
    // watchdog can stay alive (idling) instead of being killed.
    setGamingFlag(true);
    lines.push("gaming flag set (watchdog idles)");

    const unloaded = await unloadAllModels();
    if (unloaded.length) lines.push(`unloaded ${unloaded.join(", ")}`);
    await stopOllama();
    lines.push("ollama stopped");

    for (const id of ["odysseus", "chroma"] as const) {
      const svc = serviceById(id);
      if (svc?.port && (await checkPort(svc.port))) {
        await killByPort(svc.port);
        lines.push(`${id} stopped`);
      }
    }
    await dockerCtl("n8n", "stop");
    lines.push("n8n stopped");
    const searx = await searxngContainer();
    if (searx) {
      await dockerCtl(searx, "stop");
      lines.push("searxng stopped");
    }

    await new Promise((r) => setTimeout(r, 2500));
    const after = await getSystemStats();
    const freedVram = Math.max((before.vramUsedMB ?? 0) - (after.vramUsedMB ?? 0), 0);
    const freedRam = Math.max((before.ramUsedMB ?? 0) - (after.ramUsedMB ?? 0), 0);
    const report = `Freed ${(freedVram / 1024).toFixed(1)} GB VRAM, ${(freedRam / 1024).toFixed(1)} GB RAM · ${lines.join(" · ")}`;
    await kvSet(GAMING_KEY, JSON.stringify({ active: true, lastReport: report }));
    await logAudit("gaming.enter", undefined, report);
    await finishRun(runId, { result: "ok", durMs: Date.now() - started, items: `${lines.length} steps`, detail: report });
    return report;
  } catch (e) {
    await finishRun(runId, { result: "err", durMs: Date.now() - started, detail: String(e) });
    throw e;
  } finally {
    g.__rkGamingBusy = false;
  }
}

/** Exit gaming mode: bring the stack back (stack script + watchdog + containers). */
export async function exitGamingMode(): Promise<string> {
  if (DEMO) {
    for (const s of SERVICES) demoServiceStates[s.id] = { status: "up" };
    const report = "Stack restored (demo)";
    await kvSet(GAMING_KEY, JSON.stringify({ active: false, lastReport: report }));
    return report;
  }
  g.__rkGamingBusy = true;
  const runId = `gaming-${Date.now()}`;
  const started = Date.now();
  await addRun({ id: runId, workflowId: "system", ts: started, trigger: "Gaming mode OFF", result: "run", source: "console" });
  try {
    const cfg = getConfig();
    setGamingFlag(false);
    await spawnViaWmi(psScript(path.join(cfg.paths.odysseusDir, "start-odysseus-stack.ps1")));
    // Idempotent: no-ops via its mutex when the (idling) watchdog is already alive.
    await spawnViaWmi(psScript(path.join(cfg.paths.odysseusDir, "watchdog.ps1")));
    bustProcessCache();
    await dockerCtl("n8n", "start");
    const searx = await searxngContainer();
    if (searx) await dockerCtl(searx, "start");
    const report = "Stack script + watchdog relaunched, containers started.";
    await kvSet(GAMING_KEY, JSON.stringify({ active: false, lastReport: report }));
    await logAudit("gaming.exit", undefined, report);
    await finishRun(runId, { result: "ok", durMs: Date.now() - started, detail: report });
    return report;
  } catch (e) {
    await finishRun(runId, { result: "err", durMs: Date.now() - started, detail: String(e) });
    throw e;
  } finally {
    g.__rkGamingBusy = false;
  }
}
