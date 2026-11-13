// n8n public REST API adapter (X-N8N-API-KEY). Maps n8n workflows to registry
// entries by name (config.n8nWorkflowNames) and normalizes executions into runs.
import fs from "node:fs";
import path from "node:path";
import { DEMO, env, getConfig } from "../config";
import { fetchJson } from "../net";
import type { ApprovalItem, RunRow } from "../types";

interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
}

interface N8nExecution {
  id: string;
  workflowId: string;
  status?: string; // success | error | running | waiting | canceled
  startedAt?: string;
  stoppedAt?: string;
  mode?: string;
}

export interface N8nState {
  reachable: boolean;
  authed: boolean;
  /** registry workflow id -> n8n workflow */
  byRegistry: Record<string, N8nWorkflow>;
  /** registry workflow id -> recent executions (newest first) */
  execs: Record<string, N8nExecution[]>;
}

const REGISTRY_TO_KEY: Record<string, string> = {
  "email-triage": "emailTriage",
  "outreach-sender": "outreachSender",
  "outreach-unsub": "outreachUnsub",
  "outreach-watcher": "outreachWatcher",
};

function headers() {
  return { "X-N8N-API-KEY": env.n8nApiKey() };
}

function matchRegistry(wfName: string): string | undefined {
  const names = getConfig().n8nWorkflowNames;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const [regId, key] of Object.entries(REGISTRY_TO_KEY)) {
    const want = names[key];
    if (want && (norm(wfName).includes(norm(want)) || norm(want).includes(norm(wfName)))) return regId;
  }
  return undefined;
}

export async function n8nState(): Promise<N8nState> {
  const empty: N8nState = { reachable: false, authed: false, byRegistry: {}, execs: {} };
  if (DEMO) return empty;
  if (!env.n8nApiKey()) return { ...empty, reachable: true, authed: false };
  const base = `${getConfig().services.n8nUrl}/api/v1`;
  try {
    const wfs = await fetchJson<{ data: N8nWorkflow[] }>(`${base}/workflows?limit=100`, { headers: headers() });
    const byRegistry: Record<string, N8nWorkflow> = {};
    for (const wf of wfs.data ?? []) {
      const regId = matchRegistry(wf.name);
      if (regId) byRegistry[regId] = wf;
    }
    const execs: Record<string, N8nExecution[]> = {};
    const all = await fetchJson<{ data: N8nExecution[] }>(`${base}/executions?limit=100`, { headers: headers() });
    const n8nIdToReg = Object.fromEntries(Object.entries(byRegistry).map(([reg, wf]) => [wf.id, reg]));
    for (const ex of all.data ?? []) {
      const reg = n8nIdToReg[ex.workflowId];
      if (!reg) continue;
      (execs[reg] ??= []).push(ex);
    }
    return { reachable: true, authed: true, byRegistry, execs };
  } catch (e) {
    const msg = String(e);
    if (msg.includes("401")) return { ...empty, reachable: true, authed: false };
    return empty;
  }
}

export async function setN8nActive(registryId: string, active: boolean): Promise<boolean> {
  if (DEMO) return true;
  const st = await n8nState();
  const wf = st.byRegistry[registryId];
  if (!wf) return false;
  const base = `${getConfig().services.n8nUrl}/api/v1`;
  const res = await fetch(`${base}/workflows/${wf.id}/${active ? "activate" : "deactivate"}`, {
    method: "POST",
    headers: headers(),
    signal: AbortSignal.timeout(8000),
  });
  return res.ok;
}

export function execsToRuns(state: N8nState, workflowNames: Record<string, string>): RunRow[] {
  const rows: RunRow[] = [];
  for (const [regId, list] of Object.entries(state.execs)) {
    for (const ex of list) {
      const start = ex.startedAt ? Date.parse(ex.startedAt) : Date.now();
      const stop = ex.stoppedAt ? Date.parse(ex.stoppedAt) : undefined;
      const result =
        ex.status === "success" ? "ok" : ex.status === "error" || ex.status === "crashed" ? "err" : ex.status === "running" ? "run" : "warn";
      rows.push({
        id: `n8n-${ex.id}`,
        workflowId: regId,
        workflowName: workflowNames[regId] ?? regId,
        ts: start,
        trigger: ex.mode === "trigger" ? "Trigger" : ex.mode === "webhook" ? "Webhook" : ex.mode === "manual" ? "Manual" : (ex.mode ?? "Run"),
        durMs: stop ? stop - start : undefined,
        items: undefined,
        result,
        source: "n8n",
      });
    }
  }
  return rows;
}

/** Sparkline buckets: executions per day for the last 7 days (oldest first). */
export function sparkFromExecs(list: N8nExecution[] | undefined): number[] {
  const buckets = new Array(7).fill(0);
  if (!list) return buckets;
  const now = Date.now();
  for (const ex of list) {
    if (!ex.startedAt) continue;
    const age = now - Date.parse(ex.startedAt);
    const day = Math.floor(age / 86_400_000);
    if (day >= 0 && day < 7) buckets[6 - day]++;
  }
  return buckets;
}

// ── Outreach campaign read-model (aggregates only — never recipient PII) ────

export interface OutreachStatus {
  campaign?: string;
  subject?: string;
  recipients?: number;
  sentTotal?: number;
  suppressed?: number;
  lastSendTs?: number;
  readyToSend: boolean;
}

export function outreachStatus(): OutreachStatus {
  if (DEMO)
    return { campaign: "2026-08-demo-01", subject: "Demo subject line", recipients: 38, sentTotal: 34, suppressed: 3, readyToSend: true };
  try {
    const dir = getConfig().paths.outreachDir;
    const campaign = fs.readFileSync(path.join(dir, "active-campaign.txt"), "utf8").trim();
    const out: OutreachStatus = { campaign, readyToSend: false };
    const metaPath = path.join(dir, "campaigns", campaign, "meta.json");
    if (fs.existsSync(metaPath)) out.subject = (JSON.parse(fs.readFileSync(metaPath, "utf8")) as { subject?: string }).subject;
    const recPath = path.join(dir, "campaigns", campaign, "recipients.clean.csv");
    if (fs.existsSync(recPath)) out.recipients = Math.max(fs.readFileSync(recPath, "utf8").trim().split("\n").length - 1, 0);
    const logPath = path.join(dir, "send-log.jsonl");
    if (fs.existsSync(logPath)) {
      const lines = fs.readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean);
      out.sentTotal = lines.length;
      const last = lines.at(-1);
      if (last) {
        const ts = (JSON.parse(last) as { ts?: string | number }).ts;
        out.lastSendTs = typeof ts === "string" ? Date.parse(ts) : ts;
      }
    }
    const supPath = path.join(dir, "suppression.jsonl");
    if (fs.existsSync(supPath)) out.suppressed = fs.readFileSync(supPath, "utf8").trim().split("\n").filter(Boolean).length;
    // "Ready" = an active campaign with recipients and no send in the last 20h.
    out.readyToSend = !!out.recipients && (!out.lastSendTs || Date.now() - out.lastSendTs > 20 * 3_600_000);
    return out;
  } catch {
    return { readyToSend: false };
  }
}

export function outreachApproval(status: OutreachStatus): ApprovalItem | null {
  if (!status.readyToSend || !status.campaign) return null;
  return {
    id: `outreach-${status.campaign}`,
    workflowId: "outreach-sender",
    workflowName: "Outreach batch sender",
    source: "n8n",
    title: `Campaign "${status.campaign}" ready to send`,
    snippet: `${status.recipients ?? "?"} recipients · subject: "${status.subject ?? "?"}" · ${status.suppressed ?? 0} suppressed. Sending stays manual in n8n by design.`,
    ts: Date.now(),
    href: `${getConfig().services.n8nUrl}`,
  };
}
