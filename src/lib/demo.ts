// In-memory fixtures powering DEMO=1 (the public Vercel demo + README screenshots).
// Mirrors the real registry so the UI is pixel-identical, with invented content.
import type { ApprovalItem, RunRow, Autonomy } from "./types";

type StoredRun = {
  id: string;
  workflowId: string;
  ts: number;
  trigger: string;
  durMs?: number;
  items?: string;
  result: string;
  source: string;
  detail?: string;
};

type StoredApproval = {
  id: string;
  workflowId: string;
  source: string;
  externalId?: string;
  title: string;
  snippet: string;
  body?: string;
  confidence?: number;
  ts: number;
  status: string;
  resolvedTs?: number;
};

const now = Date.now();
const min = 60_000;
const hr = 3_600_000;

function seedRuns(): StoredRun[] {
  const rows: StoredRun[] = [];
  const mk = (id: string, workflowId: string, agoMs: number, trigger: string, durMs: number, items: string, result: string, source: string) =>
    rows.push({ id, workflowId, ts: now - agoMs, trigger, durMs, items, result, source });
  mk("d1", "email-triage", 9 * min, "Inbox poll", 12_000, "9 emails", "ok", "n8n");
  mk("d2", "agent-network", 25 * min, "Manual run", 38_000, "1 plan", "warn", "odysseus");
  mk("d3", "email-triage", 3 * hr, "Inbox poll", 11_000, "4 emails", "ok", "n8n");
  mk("d4", "vexa-assistant", 5 * hr, "One-click launch", 46_000, "5 steps", "ok", "console");
  mk("d5", "outreach-unsub", 6 * hr, "Webhook", 900, "1 unsubscribe", "ok", "n8n");
  mk("d6", "agent-network", 26 * hr, "Manual run", 214_000, "5 agents", "ok", "odysseus");
  mk("d7", "outreach-sender", 30 * hr, "Manual execute", 2_520_000, "34 sends", "ok", "n8n");
  mk("d8", "email-triage", 31 * hr, "Inbox poll", 14_000, "11 emails", "ok", "n8n");
  return rows;
}

function seedApprovals(): StoredApproval[] {
  return [
    {
      id: "da1",
      workflowId: "agent-network",
      source: "odysseus",
      externalId: "run-demo1",
      title: "Plan gate — pomodoro timer build",
      snippet: "Planner proposes 6 steps: scaffold single-file HTML, 25/5 cycles, pause/resume, dark theme…",
      body: "Step plan looks scoped to the ask. Approving resumes the run into Developer → UI → Reviewer → Docs.",
      ts: now - 18 * min,
      status: "pending",
    },
    {
      id: "da2",
      workflowId: "email-triage",
      source: "email",
      title: "Sales lead draft — 'Meridian Build' enquiry",
      snippet: "Drafted reply to a systems-audit enquiry. Saved as DRAFT — nothing auto-sends.",
      ts: now - 4 * hr,
      status: "pending",
    },
  ];
}

class DemoStore {
  runs: StoredRun[] = seedRuns();
  approvals: StoredApproval[] = seedApprovals();
  auditRows: { id: number; ts: number; actor: string; action: string; target?: string; detail?: string }[] = [];
  kvMap = new Map<string, string>();
  private auditId = 1;

  addRun(r: StoredRun) {
    const i = this.runs.findIndex((x) => x.id === r.id);
    if (i >= 0) this.runs[i] = { ...this.runs[i], ...r };
    else this.runs.unshift(r);
  }
  finishRun(id: string, patch: Partial<StoredRun>) {
    const i = this.runs.findIndex((x) => x.id === id);
    if (i >= 0) this.runs[i] = { ...this.runs[i], ...patch };
  }
  listRuns(limit: number, workflowId?: string): RunRow[] {
    return this.runs
      .filter((r) => !workflowId || r.workflowId === workflowId)
      .slice(0, limit)
      .map((r) => ({
        id: r.id,
        workflowId: r.workflowId,
        workflowName: r.workflowId,
        ts: r.ts,
        trigger: r.trigger,
        durMs: r.durMs,
        items: r.items,
        result: r.result as RunRow["result"],
        source: r.source as RunRow["source"],
        detail: r.detail,
      }));
  }
  addApproval(a: Omit<StoredApproval, "status">) {
    if (!this.approvals.some((x) => x.id === a.id)) this.approvals.unshift({ ...a, status: "pending" });
  }
  pendingApprovals() {
    return this.approvals.filter((a) => a.status === "pending");
  }
  resolveApproval(id: string, status: string) {
    const a = this.approvals.find((x) => x.id === id);
    if (a && a.status === "pending") {
      a.status = status;
      a.resolvedTs = Date.now();
    }
  }
  logAudit(action: string, target?: string, detail?: string) {
    this.auditRows.unshift({ id: this.auditId++, ts: Date.now(), actor: "demo", action, target, detail });
  }
  listAudit(limit: number) {
    return this.auditRows.slice(0, limit);
  }
  kvGet(key: string) {
    return this.kvMap.get(key);
  }
  kvSet(key: string, value: string) {
    this.kvMap.set(key, value);
  }
}

const g = globalThis as unknown as { __rkDemo?: DemoStore };
export const demoStore: DemoStore = g.__rkDemo ?? (g.__rkDemo = new DemoStore());

// ── Live-status fixtures (poller substitutes) ───────────────────────────────
export const demoServiceStates: Record<string, { status: "up" | "down"; detail?: string }> = {
  watchdog: { status: "up", detail: "heartbeat 12s ago" },
  odysseus: { status: "up" },
  chroma: { status: "up" },
  ollama: { status: "up", detail: "qwen2.5:14b loaded · 9.2 GB VRAM" },
  n8n: { status: "up" },
  searxng: { status: "up" },
};

export const demoSystem = {
  gpuName: "RTX 4080 (demo)",
  vramUsedMB: 9800,
  vramTotalMB: 16384,
  ramUsedMB: 21400,
  ramTotalMB: 65330,
};

export const demoWorkflowExtras: Record<
  string,
  { lastRun?: string; spark: number[]; runs7: number; successRate?: string; avgDur?: string; autonomy?: Autonomy }
> = {
  "email-triage": { lastRun: "9 min ago", spark: [8, 11, 9, 12, 10, 9, 11], runs7: 70, successRate: "99%", avgDur: "12s" },
  "outreach-sender": { lastRun: "yesterday", spark: [0, 1, 0, 0, 1, 0, 0], runs7: 2, successRate: "100%", avgDur: "42m" },
  "outreach-unsub": { lastRun: "6 hrs ago", spark: [1, 0, 2, 1, 0, 1, 1], runs7: 6, successRate: "100%", avgDur: "1s" },
  "outreach-watcher": { lastRun: "12 min ago", spark: [4, 4, 4, 4, 4, 4, 4], runs7: 28, successRate: "100%", avgDur: "3s" },
  "agent-network": { lastRun: "25 min ago", spark: [1, 2, 0, 3, 1, 2, 2], runs7: 11, successRate: "91%", avgDur: "3m 30s" },
  "vexa-assistant": { lastRun: "5 hrs ago", spark: [1, 0, 1, 1, 0, 1, 1], runs7: 5, successRate: "100%", avgDur: "46s" },
  "vexa-stream": { lastRun: "Tue 9:40 pm", spark: [0, 1, 0, 0, 1, 0, 0], runs7: 2, successRate: "100%", avgDur: "2h 10m" },
};

export function demoApprovalToItem(a: StoredApproval, workflowName: string): ApprovalItem {
  return {
    id: a.id,
    workflowId: a.workflowId,
    workflowName,
    source: a.source as ApprovalItem["source"],
    externalId: a.externalId,
    title: a.title,
    snippet: a.snippet,
    body: a.body,
    confidence: a.confidence != null ? `${Math.round(a.confidence * 100)}%` : undefined,
    ts: a.ts,
  };
}
