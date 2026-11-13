// Shared domain types for the Rook Ops console.

export type ServiceStatus = "up" | "down" | "starting" | "stopping" | "unknown";
export type WorkflowStatus = "healthy" | "running" | "paused" | "failing" | "off";
export type Autonomy = "auto" | "review";
export type RunResult = "ok" | "warn" | "err" | "run";

/** Infrastructure services that can be toggled to free VRAM/RAM ("gaming mode"). */
export interface ServiceDef {
  id: string;
  name: string;
  desc: string;
  /** TCP port probed for liveness (when set). */
  port?: number;
  kind: "process" | "docker" | "task" | "ollama";
  /** Rough memory the service holds while up — shown in the UI. */
  memHint?: string;
  /** Stopped by gaming mode. */
  gamingStop: boolean;
  /** Lower starts first when restoring the stack. */
  startOrder: number;
}

export interface ServiceState {
  status: ServiceStatus;
  /** Human line, e.g. loaded model list for Ollama. */
  detail?: string;
}

export interface WorkflowDef {
  id: string;
  name: string;
  category: string;
  schedule: string;
  kind: "n8n" | "odysseus" | "launcher" | "folder";
  autonomyDefault: Autonomy;
  /** Pipeline step labels for the detail drawer (review steps highlighted by name). */
  pipeline: string[];
  /** External deep links (n8n editor, Odysseus, panel …). */
  links?: { label: string; href: string }[];
  /** Which service ids this workflow depends on (preflight display). */
  needs?: string[];
  description?: string;
}

export interface WorkflowState {
  enabled: boolean;
  autonomy: Autonomy;
  status: WorkflowStatus;
  lastRun?: string;
  /** Items pending review for this workflow. */
  pending: number;
  /** Runs per day, last 7 days (oldest first). */
  spark: number[];
  runs7: number;
  successRate?: string;
  avgDur?: string;
  error?: string;
}

export interface RunRow {
  id: string;
  workflowId: string;
  workflowName: string;
  ts: number;
  trigger: string;
  durMs?: number;
  items?: string;
  result: RunResult;
  source: "console" | "n8n" | "odysseus";
  detail?: string;
}

export interface ApprovalItem {
  id: string;
  workflowId: string;
  workflowName: string;
  source: "odysseus" | "n8n" | "email";
  externalId?: string;
  title: string;
  snippet: string;
  body?: string;
  confidence?: string;
  ts: number;
  /** Optional deep link instead of inline approve (e.g. n8n manual sender). */
  href?: string;
}

export interface SystemStats {
  gpuName?: string;
  vramUsedMB?: number;
  vramTotalMB?: number;
  ramUsedMB?: number;
  ramTotalMB?: number;
}

export interface LauncherStep {
  id: string;
  label: string;
  status: "pending" | "running" | "ok" | "fail" | "skipped";
  note?: string;
}

export interface LauncherRun {
  launcherId: string;
  startedAt: number;
  finishedAt?: number;
  steps: LauncherStep[];
  ok?: boolean;
}

export interface GamingState {
  active: boolean;
  busy: boolean;
  lastReport?: string;
}

/** Full console snapshot pushed over SSE. */
export interface Snapshot {
  ts: number;
  demo: boolean;
  services: Record<string, ServiceState>;
  workflows: Record<string, WorkflowState>;
  system: SystemStats;
  gaming: GamingState;
  approvals: ApprovalItem[];
  recentRuns: RunRow[];
  launchers: Record<string, LauncherRun | undefined>;
  runsToday: number;
}
