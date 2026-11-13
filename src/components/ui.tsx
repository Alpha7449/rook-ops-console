"use client";
import type { RunResult, ServiceStatus, WorkflowStatus } from "@/lib/types";

export function Toggle({
  on,
  onChange,
  large,
  disabled,
  title,
  ariaLabel,
}: {
  on: boolean;
  onChange: () => void;
  large?: boolean;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      className={`rk-tog ${on ? "on" : ""} ${large ? "lg" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      disabled={disabled}
      title={title}
      aria-pressed={on}
      aria-label={ariaLabel}
    >
      <span className="knob" />
    </button>
  );
}

export function StatusChip({ status }: { status: WorkflowStatus }) {
  const map: Record<WorkflowStatus, { cls: string; label: string; pulse?: boolean }> = {
    healthy: { cls: "ok", label: "Healthy" },
    running: { cls: "run", label: "Running", pulse: true },
    paused: { cls: "warn", label: "Paused" },
    failing: { cls: "err", label: "Failing" },
    off: { cls: "off", label: "Off" },
  };
  const m = map[status];
  return (
    <span className={`rk-chip ${m.cls}`}>
      {m.pulse && <span className="rk-dot" />}
      {m.label}
    </span>
  );
}

export function ServiceChip({ status }: { status: ServiceStatus }) {
  const map: Record<ServiceStatus, { cls: string; label: string; pulse?: boolean }> = {
    up: { cls: "ok", label: "Up" },
    down: { cls: "off", label: "Down" },
    starting: { cls: "run", label: "Starting", pulse: true },
    stopping: { cls: "warn", label: "Stopping", pulse: true },
    unknown: { cls: "off", label: "?" },
  };
  const m = map[status];
  return (
    <span className={`rk-chip ${m.cls}`}>
      {m.pulse && <span className="rk-dot" />}
      {m.label}
    </span>
  );
}

export function ResultChip({ result }: { result: RunResult }) {
  const map: Record<RunResult, { cls: string; label: string; pulse?: boolean }> = {
    ok: { cls: "ok", label: "Success" },
    warn: { cls: "warn", label: "Needs review" },
    err: { cls: "err", label: "Failed" },
    run: { cls: "run", label: "Running", pulse: true },
  };
  const m = map[result];
  return (
    <span className={`rk-chip ${m.cls}`}>
      {m.pulse && <span className="rk-dot" />}
      {m.label}
    </span>
  );
}

export function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => `${2 + i * (80 / Math.max(data.length - 1, 1))},${20 - (v / max) * 16}`).join(" ");
  return (
    <svg width={84} height={22} viewBox="0 0 84 22" style={{ display: "block" }} aria-hidden>
      <polyline points={pts} fill="none" stroke="var(--rk-spark)" strokeWidth={1.5} />
    </svg>
  );
}

export function fmtTime(ts: number): string {
  const d = new Date(ts);
  const today = new Date().setHours(0, 0, 0, 0);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (ts >= today) return time;
  if (ts >= today - 86_400_000) return `Yesterday ${time}`;
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${time}`;
}

export function fmtAgoShort(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 90_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} hrs ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function fmtDur(ms?: number): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
  return `${Math.floor(ms / 3_600_000)}h ${Math.round((ms % 3_600_000) / 60_000)}m`;
}
