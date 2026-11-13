// One-click launchers: ordered steps with preflight, wait conditions, and live
// progress (pushed over the SSE snapshot). v1 launchers: Vexa day/night shift.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEMO, getConfig } from "../config";
import { checkPort } from "../net";
import { bustProcessCache, cachedCommandLineRunning, commandLineRunning, processRunning, runPs } from "../ps";
import type { LauncherRun, LauncherStep } from "../types";
import { addRun, finishRun, logAudit } from "../db/repo";
import { bus } from "../bus";
import { startService } from "./services";

type StepSpec = {
  id: string;
  label: string;
  /** Already satisfied? */
  check: () => Promise<boolean>;
  /** Kick it off (only called when check() was false). Throw to fail with a message. */
  start: () => Promise<void>;
  /** Poll check() until true or timeout. 0 = the check itself is the verdict. */
  waitMs: number;
  /** After check() passes, wait this long and re-check — catches starts-then-crashes. */
  stabilityMs?: number;
  /** Pause after the step passes (give slow programs time to finish loading). */
  settleMs?: number;
  note?: string;
  optional?: boolean;
};

const g = globalThis as unknown as { __rkLaunchers?: Map<string, LauncherRun> };
const runsMap = () => (g.__rkLaunchers ??= new Map<string, LauncherRun>());

export function launcherRuns(): Record<string, LauncherRun | undefined> {
  const out: Record<string, LauncherRun | undefined> = {};
  for (const [k, v] of runsMap()) out[k] = v;
  return out;
}

function vtuberPython() {
  return path.join(getConfig().paths.vtuberDir, ".venv", "Scripts", "python.exe");
}

const vtsPort = () => getConfig().vtsApiPort ?? 8001;

/**
 * The Vexa brain runs on the machine's STORED Claude subscription login
 * (~/.claude/.credentials.json) — desktop-app sessions use their own
 * host-managed auth and keep working even when this store is dead, so check
 * it explicitly before launching her into an instant OAuth crash.
 */
function hasStoredClaudeLogin(): boolean {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".claude", ".credentials.json"), "utf8")) as {
      claudeAiOauth?: { accessToken?: string };
      accessToken?: string;
    };
    return Boolean(raw.claudeAiOauth?.accessToken || raw.accessToken);
  } catch {
    return false;
  }
}

function vexaSteps(mode: "assistant" | "stream"): StepSpec[] {
  const cfg = getConfig();
  return [
    {
      id: "chroma",
      label: "ChromaDB (semantic memory)",
      check: () => checkPort(8100),
      start: () => startService("chroma"),
      waitMs: 30000,
      note: "Without it Vexa silently falls back to keyword memory.",
    },
    {
      id: "ollama",
      label: "Ollama (embeddings)",
      check: () => checkPort(11434),
      start: () => startService("ollama"),
      waitMs: 25000,
    },
    {
      id: "vts",
      label: "VTube Studio API",
      // The window appearing is not enough — Vexa needs the API websocket, which
      // comes up well after the process. Wait for the port, not the process.
      check: () => checkPort(vtsPort()),
      start: async () => {
        if (!(await processRunning("VTube Studio"))) {
          await runPs(`Start-Process 'steam://rungameid/${cfg.vtubeStudioSteamId}'`);
        }
      },
      waitMs: 240000,
      settleMs: 4000,
      note: `Steam launch → waits for the API on :${cfg.vtsApiPort ?? 8001} (can take a couple of minutes; approve the plugin popup if VTS asks).`,
    },
    {
      id: "obs",
      label: "OBS Studio",
      check: () => processRunning("obs64"),
      start: async () => {
        const exe = cfg.paths.obsExe;
        await runPs(
          `Start-Process -FilePath '${exe.replace(/'/g, "''")}' -WorkingDirectory '${path.dirname(exe).replace(/'/g, "''")}'`,
        );
      },
      waitMs: 45000,
      settleMs: 3000,
      optional: mode === "assistant",
      note: mode === "assistant" ? "Optional for the day shift — skipped." : "Scenes + captions + panic key.",
    },
    {
      id: "login",
      label: "Claude subscription login",
      check: async () => hasStoredClaudeLogin(),
      start: async () => {
        throw new Error("Stored Claude login is missing/expired — run `claude /login` in any terminal, then relaunch.");
      },
      waitMs: 0,
      note: "Her brain uses the machine's stored Claude login, not the desktop app's.",
    },
    {
      id: "vexa",
      label: mode === "assistant" ? "Vexa assistant (day shift)" : "Vexa stream (night shift)",
      check: () => commandLineRunning(mode === "assistant" ? "VTuber auto*assistant.py" : "VTuber auto*app.py"),
      start: async () => {
        const py = vtuberPython();
        const script = mode === "assistant" ? "assistant.py" : "app.py";
        // Own console via `powershell -NoExit` so the window SURVIVES a crash and
        // Ryan can always read why she exited.
        const inner = `& ''${py}'' ${script}`;
        await runPs(
          `Start-Process powershell -WorkingDirectory '${cfg.paths.vtuberDir.replace(/'/g, "''")}' ` +
            `-ArgumentList '-NoExit','-ExecutionPolicy','Bypass','-Command','${inner}'`,
        );
      },
      waitMs: 30000,
      stabilityMs: 9000,
      note: mode === "assistant" ? "Hold RIGHT CTRL to talk." : undefined,
    },
  ];
}

const LAUNCHERS: Record<string, () => StepSpec[]> = {
  "vexa-assistant": () => vexaSteps("assistant"),
  "vexa-stream": () => vexaSteps("stream"),
};

export function isLauncher(id: string): boolean {
  return id in LAUNCHERS;
}

async function waitFor(check: () => Promise<boolean>, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return check();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function startLauncher(id: string): Promise<LauncherRun> {
  const specs = LAUNCHERS[id]?.();
  if (!specs) throw new Error(`unknown launcher ${id}`);

  const existing = runsMap().get(id);
  if (existing && !existing.finishedAt) return existing; // already launching

  const run: LauncherRun = {
    launcherId: id,
    startedAt: Date.now(),
    steps: specs.map((s): LauncherStep => ({ id: s.id, label: s.label, status: "pending", note: s.note })),
  };
  runsMap().set(id, run);
  const runId = `launch-${id}-${run.startedAt}`;
  await addRun({ id: runId, workflowId: id, ts: run.startedAt, trigger: "One-click launch", result: "run", source: "console" });
  await logAudit("launcher.start", id);

  // Fire the sequence without blocking the API response.
  void (async () => {
    let ok = true;
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      const step = run.steps[i];
      if (spec.optional) {
        step.status = "skipped";
        bus().emit("launcher", id);
        continue;
      }
      step.status = "running";
      bus().emit("launcher", id);
      try {
        if (DEMO) {
          await sleep(900);
          step.status = "ok";
          continue;
        }
        if (await spec.check()) {
          step.status = "ok";
          step.note = step.note ? `already up · ${step.note}` : "already up";
          continue;
        }
        await spec.start();
        let arrived = spec.waitMs === 0 ? await spec.check() : await waitFor(spec.check, spec.waitMs);
        if (arrived && spec.stabilityMs) {
          await sleep(spec.stabilityMs);
          if (!(await spec.check())) {
            arrived = false;
            step.note = "started, then exited — read the error in its console window";
          }
        }
        if (arrived && spec.settleMs) await sleep(spec.settleMs);
        step.status = arrived ? "ok" : "fail";
        if (!arrived) {
          ok = false;
          step.note ??= `not up after ${Math.round(spec.waitMs / 1000)}s`;
        }
      } catch (e) {
        step.status = "fail";
        step.note = e instanceof Error ? e.message : String(e);
        ok = false;
      } finally {
        bus().emit("launcher", id);
      }
      if (!ok) break;
    }
    run.finishedAt = Date.now();
    run.ok = ok;
    bustProcessCache();
    await finishRun(runId, {
      result: ok ? "ok" : "err",
      durMs: run.finishedAt - run.startedAt,
      items: `${run.steps.filter((s) => s.status === "ok").length}/${run.steps.length} steps`,
      detail: run.steps.map((s) => `${s.label}: ${s.status}${s.status === "fail" && s.note ? ` (${s.note})` : ""}`).join(" · "),
    });
    bus().emit("launcher", id);
  })();

  return run;
}

/** Is the workflow's main process alive right now? (for dashboard status) */
export async function launcherProcessAlive(id: string): Promise<boolean> {
  if (DEMO) return false;
  if (id === "vexa-assistant") return cachedCommandLineRunning("VTuber auto*assistant.py");
  if (id === "vexa-stream") return cachedCommandLineRunning("VTuber auto*app.py");
  return false;
}
