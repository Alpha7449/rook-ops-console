// Data-access layer. In DEMO mode everything is served from in-memory fixtures
// so the app deploys anywhere (Vercel demo) without a native sqlite binding.
import { and, desc, eq } from "drizzle-orm";
import { DEMO } from "../config";
import type { Autonomy, RunRow } from "../types";
import { demoStore } from "../demo";

type NewRun = {
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

type NewApproval = {
  id: string;
  workflowId: string;
  source: string;
  externalId?: string;
  title: string;
  snippet: string;
  body?: string;
  confidence?: number;
  ts: number;
};

async function db() {
  const { getDb } = await import("./index");
  return getDb();
}

export async function addRun(r: NewRun) {
  if (DEMO) return demoStore.addRun(r);
  const { runs } = await import("./schema");
  (await db()).insert(runs).values(r).onConflictDoUpdate({
    target: runs.id,
    set: { result: r.result, durMs: r.durMs, items: r.items, detail: r.detail },
  }).run();
}

export async function finishRun(id: string, patch: { result: string; durMs?: number; items?: string; detail?: string }) {
  if (DEMO) return demoStore.finishRun(id, patch);
  const { runs } = await import("./schema");
  (await db()).update(runs).set(patch).where(eq(runs.id, id)).run();
}

export async function listConsoleRuns(limit = 100, workflowId?: string): Promise<RunRow[]> {
  if (DEMO) return demoStore.listRuns(limit, workflowId);
  const { runs } = await import("./schema");
  const d = await db();
  const rows = workflowId
    ? d.select().from(runs).where(eq(runs.workflowId, workflowId)).orderBy(desc(runs.ts)).limit(limit).all()
    : d.select().from(runs).orderBy(desc(runs.ts)).limit(limit).all();
  return rows.map((r) => ({
    id: r.id,
    workflowId: r.workflowId,
    workflowName: r.workflowId,
    ts: r.ts,
    trigger: r.trigger,
    durMs: r.durMs ?? undefined,
    items: r.items ?? undefined,
    result: r.result as RunRow["result"],
    source: r.source as RunRow["source"],
    detail: r.detail ?? undefined,
  }));
}

export async function addApproval(a: NewApproval) {
  if (DEMO) return demoStore.addApproval(a);
  const { approvals } = await import("./schema");
  (await db()).insert(approvals).values(a).onConflictDoNothing().run();
}

export async function pendingApprovals() {
  if (DEMO) return demoStore.pendingApprovals();
  const { approvals } = await import("./schema");
  return (await db()).select().from(approvals).where(eq(approvals.status, "pending")).orderBy(desc(approvals.ts)).all();
}

export async function resolveApproval(id: string, status: "approved" | "rejected") {
  if (DEMO) return demoStore.resolveApproval(id, status);
  const { approvals } = await import("./schema");
  (await db())
    .update(approvals)
    .set({ status, resolvedTs: Date.now() })
    .where(and(eq(approvals.id, id), eq(approvals.status, "pending")))
    .run();
}

export async function logAudit(action: string, target?: string, detail?: string) {
  if (DEMO) return demoStore.logAudit(action, target, detail);
  const { audit } = await import("./schema");
  (await db()).insert(audit).values({ ts: Date.now(), actor: "ryan", action, target, detail }).run();
}

export async function listAudit(limit = 200) {
  if (DEMO) return demoStore.listAudit(limit);
  const { audit } = await import("./schema");
  return (await db()).select().from(audit).orderBy(desc(audit.ts)).limit(limit).all();
}

export async function kvGet(key: string): Promise<string | undefined> {
  if (DEMO) return demoStore.kvGet(key);
  const { kv } = await import("./schema");
  const row = (await db()).select().from(kv).where(eq(kv.key, key)).get();
  return row?.value;
}

export async function kvSet(key: string, value: string) {
  if (DEMO) return demoStore.kvSet(key, value);
  const { kv } = await import("./schema");
  (await db()).insert(kv).values({ key, value }).onConflictDoUpdate({ target: kv.key, set: { value } }).run();
}

// ── Workflow state overrides (enabled / autonomy) ────────────────────────────
export async function getWorkflowOverride(id: string): Promise<{ enabled?: boolean; autonomy?: Autonomy }> {
  const raw = await kvGet(`wf:${id}`);
  return raw ? JSON.parse(raw) : {};
}

export async function setWorkflowOverride(id: string, patch: { enabled?: boolean; autonomy?: Autonomy }) {
  const cur = await getWorkflowOverride(id);
  await kvSet(`wf:${id}`, JSON.stringify({ ...cur, ...patch }));
}
