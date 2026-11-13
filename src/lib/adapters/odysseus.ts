// Odysseus Agent Network adapter — pending approval gates + run history.
// API: /api/agents/network/runs (+ /{id}, /{id}/resume {action: approve|revise, feedback}).
// Auth: Bearer ody_ token (mint one in Odysseus → API tokens; put in .env.local).
import { DEMO, env, getConfig } from "../config";
import { fetchJson } from "../net";
import type { ApprovalItem, RunRow } from "../types";

interface OdyRunSummary {
  id: string;
  status: string; // running | awaiting_approval | complete | error ...
  input: string;
  awaiting_agent: string | null;
  updated_at: string | null;
}

interface OdyRunDetail extends OdyRunSummary {
  history: { agent?: string; content?: string }[];
  next_agent?: string | null;
}

export interface OdysseusState {
  reachable: boolean;
  authed: boolean;
  runs: OdyRunSummary[];
}

const base = () => `${getConfig().services.odysseusUrl}/api/agents`;
const auth = () => ({ Authorization: `Bearer ${env.odysseusToken()}` });

export async function odysseusState(): Promise<OdysseusState> {
  if (DEMO) return { reachable: true, authed: true, runs: [] };
  if (!env.odysseusToken()) return { reachable: true, authed: false, runs: [] };
  try {
    const runs = await fetchJson<OdyRunSummary[]>(`${base()}/network/runs`, { headers: auth() });
    return { reachable: true, authed: true, runs };
  } catch (e) {
    if (String(e).includes("401")) return { reachable: true, authed: false, runs: [] };
    return { reachable: false, authed: false, runs: [] };
  }
}

export async function runDetail(id: string): Promise<OdyRunDetail | null> {
  try {
    return await fetchJson<OdyRunDetail>(`${base()}/network/runs/${id}`, { headers: auth() });
  } catch {
    return null;
  }
}

export async function resumeRun(id: string, action: "approve" | "revise", feedback = ""): Promise<boolean> {
  if (DEMO) return true;
  try {
    const res = await fetch(`${base()}/network/runs/${id}/resume`, {
      method: "POST",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify({ action, feedback }),
      signal: AbortSignal.timeout(15000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function odysseusApprovals(state: OdysseusState): ApprovalItem[] {
  return state.runs
    .filter((r) => r.status === "awaiting_approval")
    .map((r) => ({
      id: `ody-${r.id}`,
      workflowId: "agent-network",
      workflowName: "Agent Network builds",
      source: "odysseus" as const,
      externalId: r.id,
      title: `${r.awaiting_agent ?? "Agent"} gate — ${r.input.slice(0, 70) || "run"}`,
      snippet: `Run ${r.id} paused at the ${r.awaiting_agent ?? "?"} approval gate. Approve to continue the pipeline, reject to send it back with feedback.`,
      ts: r.updated_at ? Date.parse(r.updated_at) : Date.now(),
    }));
}

export function odysseusRuns(state: OdysseusState): RunRow[] {
  return state.runs.map((r) => {
    const result =
      r.status === "complete" ? "ok" : r.status === "error" ? "err" : r.status === "awaiting_approval" ? "warn" : "run";
    return {
      id: `ody-${r.id}`,
      workflowId: "agent-network",
      workflowName: "Agent Network builds",
      ts: r.updated_at ? Date.parse(r.updated_at) : Date.now(),
      trigger: r.input ? r.input.slice(0, 60) : "Run",
      result,
      source: "odysseus" as const,
      items: r.status === "awaiting_approval" ? `paused at ${r.awaiting_agent}` : undefined,
    };
  });
}
