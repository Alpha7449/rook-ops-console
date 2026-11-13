"use client";
// Slide-over panels: review queue + workflow detail (from the design canvas).
import { useState } from "react";
import { useConsole } from "./ConsoleProvider";
import { ResultChip, StatusChip, Toggle, fmtAgoShort, fmtDur, fmtTime } from "./ui";
import { WORKFLOWS } from "@/lib/registry";
import type { ApprovalItem } from "@/lib/types";

function QueueCard({ item }: { item: ApprovalItem }) {
  const { approvalAction } = useConsole();
  const [expanded, setExpanded] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const isOdy = item.source === "odysseus";

  return (
    <div style={{ border: "1px solid var(--rk-bd)", borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
        <span className="rk-chip soft" style={{ fontSize: 10.5 }}>
          {item.workflowName}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: "var(--rk-faint)" }}>{fmtAgoShort(item.ts)}</span>
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--rk-ink)", marginBottom: 3 }}>{item.title}</div>
      <div style={{ fontSize: 12.5, color: "var(--rk-mut)", lineHeight: 1.5 }}>{item.snippet}</div>
      {expanded && (item.body || item.confidence) && (
        <div
          style={{
            marginTop: 10,
            background: "var(--rk-inset)",
            border: "1px solid var(--rk-bd)",
            borderRadius: 8,
            padding: 12,
            fontSize: 12.5,
            color: "var(--rk-body)",
            lineHeight: 1.6,
          }}
        >
          {item.body}
          {item.confidence && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--rk-bd)", fontSize: 12, color: "var(--rk-mut)" }}>
              Model confidence: <b style={{ color: "var(--rk-warn-fg)" }}>{item.confidence}</b>
            </div>
          )}
        </div>
      )}
      {rejecting && isOdy && (
        <textarea
          className="rk-input"
          style={{ marginTop: 10, minHeight: 60 }}
          placeholder="Feedback for the agent (what to change)…"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
        />
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
        {item.href ? (
          <a className="rk-btn primary sm" style={{ textDecoration: "none" }} href={item.href} target="_blank" rel="noreferrer">
            Open in n8n ↗
          </a>
        ) : (
          <button
            type="button"
            className="rk-btn primary sm"
            onClick={() => void approvalAction(item.id, "approve")}
          >
            Approve
          </button>
        )}
        {rejecting && isOdy ? (
          <button
            type="button"
            className="rk-btn danger sm"
            onClick={() => void approvalAction(item.id, "reject", feedback)}
          >
            Send back
          </button>
        ) : (
          <button
            type="button"
            className="rk-btn danger sm"
            onClick={() => {
              if (isOdy) setRejecting(true);
              else void approvalAction(item.id, "reject");
            }}
          >
            {item.href ? "Dismiss" : "Reject"}
          </button>
        )}
        <span style={{ flex: 1 }} />
        {(item.body || item.confidence) && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            style={{ fontSize: 12, fontWeight: 600, color: "var(--rk-link)", background: "none", border: 0, cursor: "pointer" }}
          >
            {expanded ? "Hide details" : "Details"}
          </button>
        )}
      </div>
    </div>
  );
}

function QueueDrawer() {
  const { snap, closePanel } = useConsole();
  const items = snap?.approvals ?? [];
  return (
    <div className="rk-drawer" style={{ width: 472, maxWidth: "92vw" }} data-testid="queue-drawer">
      <div className="rk-drawer-head">
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 17, margin: 0, letterSpacing: "-0.015em" }}>Review queue</h2>
          <div style={{ fontSize: 12.5, color: "var(--rk-mut)", marginTop: 2 }}>
            {items.length ? `${items.length} item${items.length > 1 ? "s" : ""} waiting on you` : "nothing waiting"}
          </div>
        </div>
        <button type="button" className="rk-x" onClick={closePanel}>
          ×
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        {items.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--rk-mut)", fontSize: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--rk-ink)", marginBottom: 6 }}>All clear</div>
            Nothing is waiting on you. Approved items are delivered by their workflow.
          </div>
        )}
        {items.map((t) => (
          <QueueCard key={t.id} item={t} />
        ))}
      </div>
    </div>
  );
}

function WorkflowDrawer({ id }: { id: string }) {
  const { snap, closePanel, openQueue, workflowAction } = useConsole();
  const def = WORKFLOWS.find((w) => w.id === id);
  const st = snap?.workflows[id];
  const runs = (snap?.recentRuns ?? []).filter((r) => r.workflowId === id).slice(0, 6);
  const launcher = snap?.launchers[id];
  if (!def || !st) return null;
  const isReviewStep = (label: string) => /review|gate|approve|human/i.test(label);

  return (
    <div className="rk-drawer" style={{ width: 560, maxWidth: "94vw" }} data-testid="workflow-drawer">
      <div className="rk-drawer-head" style={{ padding: "16px 22px", gap: 12 }}>
        <Toggle
          large
          ariaLabel={`${def.name} workflow`}
          on={st.enabled}
          onChange={() => void workflowAction(id, { action: st.enabled ? "disable" : "enable" })}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: 17, margin: 0, letterSpacing: "-0.015em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {def.name}
          </h2>
          <div style={{ fontSize: 12.5, color: "var(--rk-mut)", marginTop: 2 }}>
            {def.category} · {def.schedule}
            {st.avgDur ? ` · avg ${st.avgDur}` : ""}
          </div>
        </div>
        <StatusChip status={st.status} />
        <button type="button" className="rk-x" onClick={closePanel}>
          ×
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
        {st.error && (
          <div
            style={{
              background: "var(--rk-err-bg)",
              border: "1px solid var(--rk-err-bd)",
              borderRadius: 8,
              padding: "11px 14px",
              fontSize: 13,
              color: "var(--rk-err-fg)",
            }}
          >
            <b>Attention.</b> {st.error}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="rk-btn primary"
            disabled={!st.enabled}
            onClick={() =>
              void workflowAction(id, { action: "run" }).then((r) => {
                if (r.href?.startsWith("http")) window.open(r.href, "_blank");
                else if (r.href) window.location.href = r.href;
              })
            }
          >
            {def.kind === "launcher" ? "Launch" : st.status === "running" ? "Running…" : "Open to run"}
          </button>
          <span style={{ flex: 1 }} />
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--rk-mut)" }}>Autonomy</label>
          <select
            className="rk-select"
            style={{ width: "auto" }}
            value={st.autonomy}
            onChange={(e) => void workflowAction(id, { action: "autonomy", autonomy: e.target.value })}
          >
            <option value="auto">Auto-send</option>
            <option value="review">Needs approval</option>
          </select>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
          {[
            ["Runs · 7 days", String(st.runs7)],
            ["Success rate", st.successRate ?? "—"],
            ["Last run", st.lastRun ?? "—"],
          ].map(([label, value]) => (
            <div key={label} style={{ background: "var(--rk-inset)", borderRadius: 8, padding: "10px 12px" }}>
              <div className="rk-label" style={{ fontSize: 10.5 }}>
                {label}
              </div>
              <div style={{ marginTop: 2, fontSize: 16, fontWeight: 700 }}>{value}</div>
            </div>
          ))}
        </div>

        <div>
          <div className="rk-label" style={{ marginBottom: 8 }}>
            Pipeline
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {def.pipeline.map((s, i) => (
              <span key={s} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    display: "inline-block",
                    whiteSpace: "nowrap",
                    padding: "4px 11px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 600,
                    background: isReviewStep(s) ? "var(--rk-warn-bg)" : "var(--rk-inset)",
                    color: isReviewStep(s) ? "var(--rk-warn-fg)" : "var(--rk-body)",
                    border: `1px solid ${isReviewStep(s) ? "var(--rk-warn-bd)" : "var(--rk-bd)"}`,
                  }}
                >
                  {s}
                </span>
                {i < def.pipeline.length - 1 && <span style={{ color: "var(--rk-lt)", fontSize: 12 }}>→</span>}
              </span>
            ))}
          </div>
          {def.description && <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--rk-mut)", lineHeight: 1.55 }}>{def.description}</div>}
        </div>

        {launcher && (
          <div style={{ border: "1px solid var(--rk-bd)", borderRadius: 10, overflow: "hidden" }}>
            <h3 className="rk-section-h" style={{ fontSize: 13.5, padding: "11px 14px", background: "var(--rk-inset)" }}>
              Launch progress
              {!launcher.finishedAt && <span className="rk-dot" />}
            </h3>
            <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
              {launcher.steps.map((s) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                  <span style={{ width: 18, textAlign: "center" }}>
                    {s.status === "ok" ? "✓" : s.status === "fail" ? "✕" : s.status === "running" ? "…" : s.status === "skipped" ? "—" : "·"}
                  </span>
                  <span style={{ color: s.status === "fail" ? "var(--rk-err-fg)" : "var(--rk-body)", fontWeight: s.status === "running" ? 600 : 400 }}>
                    {s.label}
                  </span>
                  {s.note && <span style={{ fontSize: 11.5, color: "var(--rk-faint)" }}>{s.note}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {st.pending > 0 && (
          <div
            style={{
              background: "var(--rk-warn-bg)",
              border: "1px solid var(--rk-warn-bd)",
              borderRadius: 8,
              padding: "11px 14px",
              fontSize: 13,
              color: "var(--rk-warn-fg)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span style={{ flex: 1 }}>
              <b>{st.pending} item(s)</b> waiting on your approval.
            </span>
            <button
              type="button"
              onClick={openQueue}
              style={{ fontWeight: 600, color: "var(--rk-warn-fg)", background: "none", border: 0, cursor: "pointer", textDecoration: "underline" }}
            >
              Open queue →
            </button>
          </div>
        )}

        <div style={{ border: "1px solid var(--rk-bd)", borderRadius: 10, overflow: "hidden" }}>
          <h3 className="rk-section-h" style={{ fontSize: 13.5, padding: "11px 14px", background: "var(--rk-inset)", borderBottom: "1px solid var(--rk-bd)" }}>
            Recent runs
          </h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <tbody>
              {runs.length === 0 && (
                <tr>
                  <td style={{ padding: "14px", color: "var(--rk-mut)" }}>No runs recorded yet.</td>
                </tr>
              )}
              {runs.map((h) => (
                <tr key={h.id} className="rk-row">
                  <td className="rk-td" style={{ color: "var(--rk-mut)", whiteSpace: "nowrap", padding: "8px 14px" }}>
                    {fmtTime(h.ts)}
                  </td>
                  <td className="rk-td" style={{ color: "var(--rk-body)", padding: "8px 14px" }}>
                    {h.trigger}
                  </td>
                  <td className="rk-td" style={{ color: "var(--rk-mut)", padding: "8px 14px" }}>
                    {fmtDur(h.durMs)}
                  </td>
                  <td className="rk-td" style={{ padding: "8px 14px" }}>
                    <ResultChip result={h.result} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 12.5 }}>
          <a href={`/history?workflow=${id}`}>Open full run history →</a>
        </div>
      </div>
    </div>
  );
}

export function Drawers() {
  const { panel, closePanel } = useConsole();
  if (!panel) return null;
  return (
    <>
      <div className="rk-backdrop" onClick={closePanel} />
      {panel.kind === "queue" ? <QueueDrawer /> : <WorkflowDrawer id={panel.id} />}
    </>
  );
}
