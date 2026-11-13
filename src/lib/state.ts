// Snapshot assembly + background poller. The poller runs inside the Next.js
// server process (started lazily on first API hit), caches expensive probes on
// different cadences, and pushes full snapshots over the event bus for SSE.
import { DEMO } from "./config";
import { WORKFLOWS } from "./registry";
import type { ApprovalItem, RunRow, Snapshot, WorkflowState } from "./types";
import { bus, SNAPSHOT_EVENT } from "./bus";
import { bootReconcile, serviceStates, gamingState } from "./adapters/services";
import { getSystemStats } from "./adapters/system";
import { n8nState, execsToRuns, sparkFromExecs, outreachStatus, outreachApproval, type N8nState } from "./adapters/n8n";
import { odysseusState, odysseusApprovals, odysseusRuns, type OdysseusState } from "./adapters/odysseus";
import { launcherRuns, launcherProcessAlive } from "./adapters/launchers";
import { getWorkflowOverride, kvGet, listConsoleRuns, pendingApprovals } from "./db/repo";
import { demoWorkflowExtras, demoApprovalToItem, demoStore } from "./demo";

interface Caches {
  n8n?: { at: number; state: N8nState };
  ody?: { at: number; state: OdysseusState };
  system?: { at: number; state: Snapshot["system"] };
  snapshot?: Snapshot;
  timer?: ReturnType<typeof setInterval>;
  building?: boolean;
}

const g = globalThis as unknown as { __rkState?: Caches };
const caches = () => (g.__rkState ??= {});

const workflowName = (id: string) => WORKFLOWS.find((w) => w.id === id)?.name ?? id;

async function cachedN8n(): Promise<N8nState> {
  const c = caches();
  if (!c.n8n || Date.now() - c.n8n.at > 15000) c.n8n = { at: Date.now(), state: await n8nState() };
  return c.n8n.state;
}

async function cachedOdy(): Promise<OdysseusState> {
  const c = caches();
  if (!c.ody || Date.now() - c.ody.at > 10000) c.ody = { at: Date.now(), state: await odysseusState() };
  return c.ody.state;
}

async function cachedSystem(): Promise<Snapshot["system"]> {
  const c = caches();
  if (!c.system || Date.now() - c.system.at > 10000) c.system = { at: Date.now(), state: await getSystemStats() };
  return c.system.state;
}

function fmtAgo(ts?: number): string | undefined {
  if (!ts || Number.isNaN(ts)) return undefined;
  const diff = Date.now() - ts;
  if (diff < 90_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60000)} min ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} hrs ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

async function assembleWorkflows(
  services: Snapshot["services"],
  n8n: N8nState,
  ody: OdysseusState,
  approvals: ApprovalItem[],
  consoleRuns: RunRow[],
): Promise<Record<string, WorkflowState>> {
  const out: Record<string, WorkflowState> = {};
  for (const wf of WORKFLOWS) {
    const override = await getWorkflowOverride(wf.id);
    const enabled = override.enabled ?? true;
    const autonomy = override.autonomy ?? wf.autonomyDefault;
    const pending = approvals.filter((a) => a.workflowId === wf.id).length;
    const st: WorkflowState = {
      enabled,
      autonomy,
      status: "healthy",
      pending,
      spark: [0, 0, 0, 0, 0, 0, 0],
      runs7: 0,
    };

    if (DEMO) {
      const extra = demoWorkflowExtras[wf.id];
      if (extra) Object.assign(st, extra);
      st.status = !enabled ? "off" : wf.id === "agent-network" ? "paused" : "healthy";
      if (DEMO && wf.id === "vexa-stream" && enabled) st.status = "healthy";
      out[wf.id] = st;
      continue;
    }

    if (wf.kind === "n8n") {
      const remote = n8n.byRegistry[wf.id];
      const execs = n8n.execs[wf.id];
      st.spark = sparkFromExecs(execs);
      st.runs7 = st.spark.reduce((a, b) => a + b, 0);
      const last = execs?.[0];
      st.lastRun = fmtAgo(last?.startedAt ? Date.parse(last.startedAt) : undefined);
      if (execs?.length) {
        const done = execs.filter((e) => e.status === "success" || e.status === "error");
        if (done.length) st.successRate = `${Math.round((done.filter((e) => e.status === "success").length / done.length) * 100)}%`;
      }
      if (!n8n.reachable || services["n8n"]?.status !== "up") {
        st.status = "off";
        st.error = n8n.reachable ? undefined : "n8n unreachable";
      } else if (!n8n.authed) {
        st.status = "paused";
        st.error = "n8n API key missing — add N8N_API_KEY to .env.local";
      } else if (!remote) {
        st.status = "paused";
        st.error = "workflow not found in n8n";
      } else if (execs?.some((e) => e.status === "running")) {
        st.status = "running";
      } else if (execs?.[0]?.status === "error") {
        st.status = "failing";
        st.error = "last execution failed";
      } else if (!remote.active && wf.id !== "outreach-sender") {
        // the sender is manual-trigger by design; inactive is its normal state
        st.status = "paused";
      }
      if (!enabled) st.status = "off";
    } else if (wf.kind === "odysseus") {
      const runs = ody.runs;
      if (!ody.reachable || services["odysseus"]?.status !== "up") {
        st.status = "off";
        st.error = "Odysseus is down";
      } else if (!ody.authed) {
        st.status = "paused";
        st.error = "token missing — add ODYSSEUS_TOKEN to .env.local";
      } else if (runs.some((r) => r.status === "running" && r.updated_at && Date.now() - Date.parse(r.updated_at) < 30 * 60_000)) {
        // stale "running" rows (engine died mid-run) shouldn't pulse forever
        st.status = "running";
      } else if (runs.some((r) => r.status === "awaiting_approval")) {
        st.status = "paused";
      } else if (runs[0]?.status === "error") {
        st.status = "failing";
      }
      const latest = runs[0];
      st.lastRun = fmtAgo(latest?.updated_at ? Date.parse(latest.updated_at) : undefined);
      st.runs7 = runs.length;
      if (!enabled) st.status = "off";
    } else if (wf.kind === "launcher") {
      const alive = await launcherProcessAlive(wf.id);
      const lastLaunch = consoleRuns.find((r) => r.workflowId === wf.id);
      st.lastRun = fmtAgo(lastLaunch?.ts);
      st.status = !enabled ? "off" : alive ? "running" : "healthy";
      const missing = (wf.needs ?? []).filter((n) => services[n]?.status !== "up");
      if (enabled && !alive && missing.length) st.error = `deps down: ${missing.join(", ")}`;
    }

    // Console-run sparkline fill for non-n8n workflows.
    if (wf.kind !== "n8n") {
      const mine = consoleRuns.filter((r) => r.workflowId === wf.id);
      const buckets = new Array(7).fill(0);
      for (const r of mine) {
        const day = Math.floor((Date.now() - r.ts) / 86_400_000);
        if (day >= 0 && day < 7) buckets[6 - day]++;
      }
      if (wf.kind !== "odysseus") st.spark = buckets;
      else st.spark = buckets.map((b, i) => b + (i === 6 ? Math.min(st.runs7, 5) : 0));
      if (!st.runs7) st.runs7 = buckets.reduce((a: number, b: number) => a + b, 0);
    }

    out[wf.id] = st;
  }
  return out;
}


/** Merge console + n8n + odysseus runs, newest first. */
export function mergeRuns(consoleRuns: RunRow[], n8n: N8nState, ody: OdysseusState, limit: number): RunRow[] {
  const names = Object.fromEntries(WORKFLOWS.map((w) => [w.id, w.name]));
  names["system"] = "System";
  return [
    ...consoleRuns.map((r) => ({ ...r, workflowName: names[r.workflowId] ?? r.workflowId })),
    ...execsToRuns(n8n, names),
    ...odysseusRuns(ody),
  ]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit);
}

/** Bigger merged history for the /history page. */
export async function fullRunHistory(limit = 500): Promise<RunRow[]> {
  const [n8n, ody, consoleRuns] = await Promise.all([cachedN8n(), cachedOdy(), listConsoleRuns(400)]);
  return mergeRuns(consoleRuns, n8n, ody, limit);
}

export async function buildSnapshot(): Promise<Snapshot> {
  const [services, system, gaming, n8n, ody] = await Promise.all([
    serviceStates(),
    cachedSystem(),
    gamingState(),
    cachedN8n(),
    cachedOdy(),
  ]);

  // Approvals: odysseus gates + console-owned + outreach ready.
  const approvals: ApprovalItem[] = [];
  approvals.push(...odysseusApprovals(ody));
  if (DEMO) {
    for (const a of demoStore.pendingApprovals()) approvals.push(demoApprovalToItem(a, workflowName(a.workflowId)));
  } else {
    const dbItems = await pendingApprovals();
    for (const a of dbItems) {
      approvals.push({
        id: a.id,
        workflowId: a.workflowId,
        workflowName: workflowName(a.workflowId),
        source: a.source as ApprovalItem["source"],
        externalId: a.externalId ?? undefined,
        title: a.title,
        snippet: a.snippet,
        body: a.body ?? undefined,
        confidence: a.confidence != null ? `${Math.round(a.confidence * 100)}%` : undefined,
        ts: a.ts,
      });
    }
    const outreach = outreachApproval(outreachStatus());
    if (outreach && !approvals.some((a) => a.id === outreach.id)) {
      const dismissed = await kvGet(`dismiss:${outreach.id}`);
      if (!dismissed) approvals.push(outreach);
    }
  }
  approvals.sort((a, b) => b.ts - a.ts);

  const consoleRuns = await listConsoleRuns(200);
  const workflows = await assembleWorkflows(services, n8n, ody, approvals, consoleRuns);
  const merged = mergeRuns(consoleRuns, n8n, ody, 60);

  const midnight = new Date().setHours(0, 0, 0, 0);
  const snapshot: Snapshot = {
    ts: Date.now(),
    demo: DEMO,
    services,
    workflows,
    system,
    gaming,
    approvals,
    recentRuns: merged,
    launchers: launcherRuns(),
    runsToday: merged.filter((r) => r.ts >= midnight).length,
  };
  caches().snapshot = snapshot;
  return snapshot;
}

export function lastSnapshot(): Snapshot | undefined {
  return caches().snapshot;
}

async function tick() {
  const c = caches();
  if (c.building) return;
  c.building = true;
  try {
    const snap = await buildSnapshot();
    bus().emit(SNAPSHOT_EVENT, snap);
  } catch (e) {
    console.error("[poller]", e);
  } finally {
    c.building = false;
  }
}

export function ensurePoller() {
  const c = caches();
  if (c.timer) return;
  c.timer = setInterval(tick, 5000);
  void tick();
  void bootReconcile();
  // Launcher step changes should reflect immediately, not on the next tick.
  bus().on("launcher", () => void tick());
}

/** Force-refresh external caches (used right after actions). */
export function invalidate(kind?: "n8n" | "ody") {
  const c = caches();
  if (!kind || kind === "n8n") c.n8n = undefined;
  if (!kind || kind === "ody") c.ody = undefined;
  void tick();
}
