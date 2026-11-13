"use client";
// Dashboard — the AI Workflows console (structure from the Claude Design canvas).
import { useCallback, useState, useSyncExternalStore } from "react";
import { useConsole } from "@/components/ConsoleProvider";
import { ResultChip, ServiceChip, Sparkline, StatusChip, Toggle, fmtDur, fmtTime } from "@/components/ui";
import { SERVICES, WORKFLOWS } from "@/lib/registry";

const themeListeners = new Set<() => void>();
const themeStore = {
  subscribe(cb: () => void) {
    themeListeners.add(cb);
    return () => themeListeners.delete(cb);
  },
  get: () => document.documentElement.getAttribute("data-rk-theme") === "dark",
  getServer: () => false,
  set(dark: boolean) {
    document.documentElement.setAttribute("data-rk-theme", dark ? "dark" : "");
    try {
      localStorage.setItem("rk-theme", dark ? "dark" : "light");
    } catch {
      // private mode
    }
    themeListeners.forEach((cb) => cb());
  },
};

function ThemeToggle() {
  const dark = useSyncExternalStore(themeStore.subscribe, themeStore.get, themeStore.getServer);
  const flip = useCallback(() => themeStore.set(!themeStore.get()), []);
  return (
    <button type="button" className="rk-iconbtn" onClick={flip} title="Toggle light / dark">
      {dark ? (
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <circle cx={12} cy={12} r={4} />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}

function GamingSwitch() {
  const { snap, setGaming } = useConsole();
  const g = snap?.gaming;
  const [report, setReport] = useState<string | null>(null);
  if (!g) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        className="rk-card"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "7px 14px",
          border: `1px solid ${g.active ? "var(--rk-warn-bd)" : "var(--rk-bd)"}`,
          background: g.active ? "var(--rk-warn-bg)" : "var(--rk-panel)",
        }}
        title={g.lastReport ?? "Stop the AI stack to free VRAM/RAM for gaming"}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: g.active ? "var(--rk-warn-fg)" : "var(--rk-body)" }}>
          {g.busy ? "Switching…" : g.active ? "Gaming mode ON" : "Gaming mode"}
        </span>
        <Toggle
          ariaLabel="Gaming mode"
          on={g.active}
          disabled={g.busy}
          onChange={() => {
            void setGaming(!g.active).then((r) => setReport(r ?? null));
          }}
        />
      </div>
      {report && (
        <button
          type="button"
          onClick={() => setReport(null)}
          style={{ fontSize: 12, color: "var(--rk-mut)", background: "none", border: 0, cursor: "pointer", maxWidth: 380, textAlign: "left" }}
          title="dismiss"
        >
          {report}
        </button>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { snap, openQueue, openWorkflow, serviceAction, workflowAction } = useConsole();

  if (!snap) {
    return (
      <div className="rk-content" style={{ color: "var(--rk-mut)" }}>
        Connecting to the console…
      </div>
    );
  }

  const wfIds = WORKFLOWS.map((w) => w.id);
  const on = wfIds.filter((id) => snap.workflows[id]?.enabled).length;
  const failing = wfIds.filter((id) => snap.workflows[id]?.status === "failing");
  const running = wfIds.filter((id) => snap.workflows[id]?.status === "running").length;
  const pending = snap.approvals.length;
  const sys = snap.system;
  const vram =
    sys.vramUsedMB != null && sys.vramTotalMB ? `${(sys.vramUsedMB / 1024).toFixed(1)} / ${(sys.vramTotalMB / 1024).toFixed(0)} GB` : "—";

  return (
    <div className="rk-content">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={{ fontSize: 24, margin: 0, letterSpacing: "-0.015em" }}>AI Workflows</h1>
          <div style={{ fontSize: 13, color: "var(--rk-mut)", marginTop: 3 }}>
            {WORKFLOWS.length} workflows · {on} on · {WORKFLOWS.length - on} off
            {failing.length ? ` · ${failing.length} failing` : ""}
            {sys.gpuName ? ` · ${sys.gpuName} ${vram}` : ""}
          </div>
        </div>
        <GamingSwitch />
        <ThemeToggle />
        <button type="button" className="rk-btn ghost" onClick={openQueue}>
          Review queue · {pending}
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        <div className="rk-card rk-stat">
          <div className="rk-label">Active workflows</div>
          <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700 }}>
            {on} / {WORKFLOWS.length}
          </div>
          <div style={{ fontSize: 12, color: "var(--rk-mut)", marginTop: 2 }}>{running ? `${running} running now` : "none running now"}</div>
        </div>
        <div className="rk-card rk-stat">
          <div className="rk-label">Runs today</div>
          <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700 }}>{snap.runsToday}</div>
          <div style={{ fontSize: 12, color: "var(--rk-mut)", marginTop: 2 }}>across all sources</div>
        </div>
        <div
          className="rk-card rk-stat"
          onClick={openQueue}
          style={{ cursor: "pointer", border: "1px solid var(--rk-bd)" }}
        >
          <div className="rk-label">Pending review</div>
          <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700, color: "var(--rk-link)" }}>{pending}</div>
          <div style={{ fontSize: 12, color: "var(--rk-link)", marginTop: 2 }}>Open queue →</div>
        </div>
        <div className="rk-card rk-stat">
          <div className="rk-label">Attention</div>
          <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700, color: failing.length ? "var(--rk-err-fg)" : undefined }}>
            {failing.length ? `${failing.length} failing` : "None"}
          </div>
          <div style={{ fontSize: 12, color: "var(--rk-mut)", marginTop: 2 }}>
            {failing.length ? WORKFLOWS.find((w) => w.id === failing[0])?.name : "All workflows healthy"}
          </div>
        </div>
      </div>

      {/* Services */}
      <div className="rk-card rk-card-bd" style={{ marginBottom: 16 }}>
        <h2 className="rk-section-h">
          Services
          <span style={{ fontWeight: 400, fontSize: 12.5, color: "var(--rk-mut)" }}>the stack under the workflows — toggle to free memory</span>
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 10, padding: 12 }}>
          {SERVICES.map((s) => {
            const st = snap.services[s.id] ?? { status: "unknown" as const };
            const up = st.status === "up";
            const busy = st.status === "starting" || st.status === "stopping";
            return (
              <div key={s.id} style={{ border: "1px solid var(--rk-bd)", borderRadius: 8, padding: "10px 12px", display: "flex", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</span>
                    <ServiceChip status={st.status} />
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--rk-faint)", marginTop: 3, lineHeight: 1.4 }}>
                    {st.detail ?? s.desc}
                    {s.port ? ` · :${s.port}` : ""}
                  </div>
                </div>
                <Toggle ariaLabel={`${s.name} service`} on={up || st.status === "starting"} disabled={busy} onChange={() => void serviceAction(s.id, up ? "stop" : "start")} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Workflows table */}
      <div className="rk-card rk-card-bd" style={{ marginBottom: 16 }}>
        <h2 className="rk-section-h">
          Workflows
          <span style={{ fontWeight: 400, fontSize: 12.5, color: "var(--rk-mut)" }}>click a row for detail</span>
        </h2>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 1044 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "44px minmax(230px,1.4fr) 104px 112px 100px 104px 112px 130px",
                gap: "0 8px",
                alignItems: "center",
                padding: "8px 16px",
                background: "var(--rk-inset)",
                borderBottom: "1px solid var(--rk-bd)",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--rk-mut)",
              }}
            >
              <span>On</span>
              <span>Workflow</span>
              <span>Autonomy</span>
              <span>Last run</span>
              <span>7-day</span>
              <span>Pending</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
            {WORKFLOWS.map((w) => {
              const st = snap.workflows[w.id];
              if (!st) return null;
              return (
                <div
                  key={w.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "44px minmax(230px,1.4fr) 104px 112px 100px 104px 112px 130px",
                    gap: "0 8px",
                    alignItems: "center",
                    padding: "7px 16px",
                    borderBottom: "1px solid var(--rk-bd2)",
                    fontSize: 13,
                  }}
                >
                  <span>
                    <Toggle ariaLabel={`${w.name} workflow`} on={st.enabled} onChange={() => void workflowAction(w.id, { action: st.enabled ? "disable" : "enable" })} />
                  </span>
                  <span onClick={() => openWorkflow(w.id)} style={{ cursor: "pointer", minWidth: 0, opacity: st.enabled ? 1 : 0.5 }}>
                    <span style={{ display: "block", fontWeight: 600, color: "var(--rk-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {w.name}
                    </span>
                    <span style={{ display: "block", fontSize: 11.5, color: "var(--rk-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {w.category} · {w.schedule}
                    </span>
                  </span>
                  <span>
                    <span className={`rk-chip ${st.autonomy === "auto" ? "run" : ""}`} style={st.autonomy === "review" ? { border: "1px solid var(--rk-bd)", color: "var(--rk-mut)", background: "transparent" } : undefined}>
                      {st.autonomy === "auto" ? "Auto-send" : "Approval"}
                    </span>
                  </span>
                  <span style={{ fontSize: 12, color: "var(--rk-mut)" }}>{st.lastRun ?? "—"}</span>
                  <span>
                    <Sparkline data={st.spark} />
                  </span>
                  <span>
                    {st.pending > 0 ? (
                      <span className="rk-chip warn" style={{ cursor: "pointer" }} onClick={openQueue}>
                        {st.pending} to review
                      </span>
                    ) : (
                      <span style={{ color: "var(--rk-lt)" }}>—</span>
                    )}
                  </span>
                  <span>
                    <StatusChip status={st.status} />
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {st.enabled ? (
                      <>
                        <button
                          type="button"
                          className="rk-btn ghost sm"
                          style={{ borderWidth: 1 }}
                          onClick={() =>
                            void workflowAction(w.id, { action: "run" }).then((r) => {
                              if (r.href?.startsWith("http")) window.open(r.href, "_blank");
                              else if (r.href) window.location.href = r.href;
                            })
                          }
                        >
                          {w.kind === "launcher" ? "Launch" : "Open"}
                        </button>
                        <button
                          type="button"
                          onClick={() => openWorkflow(w.id)}
                          style={{ fontSize: 12, fontWeight: 600, color: "var(--rk-link)", background: "none", border: 0, cursor: "pointer" }}
                        >
                          Detail
                        </button>
                      </>
                    ) : (
                      <span style={{ fontSize: 12, color: "var(--rk-lt)" }}>Switched off</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent runs */}
      <div className="rk-card rk-card-bd">
        <h2 className="rk-section-h">Recent runs</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 700 }}>
            <thead>
              <tr>
                <th className="rk-th">Time</th>
                <th className="rk-th">Workflow</th>
                <th className="rk-th">Trigger</th>
                <th className="rk-th">Duration</th>
                <th className="rk-th">Output</th>
                <th className="rk-th">Result</th>
              </tr>
            </thead>
            <tbody>
              {snap.recentRuns.slice(0, 8).map((r) => (
                <tr key={r.id} className="rk-row">
                  <td className="rk-td" style={{ color: "var(--rk-mut)", whiteSpace: "nowrap" }}>
                    {fmtTime(r.ts)}
                  </td>
                  <td className="rk-td">
                    <button
                      type="button"
                      onClick={() => {
                        if (WORKFLOWS.some((w) => w.id === r.workflowId)) openWorkflow(r.workflowId);
                      }}
                      style={{ fontWeight: 600, color: "var(--rk-link)", background: "none", border: 0, cursor: "pointer", padding: 0 }}
                    >
                      {r.workflowName}
                    </button>
                  </td>
                  <td className="rk-td" style={{ color: "var(--rk-body)" }}>
                    {r.trigger}
                  </td>
                  <td className="rk-td" style={{ color: "var(--rk-mut)" }}>
                    {fmtDur(r.durMs)}
                  </td>
                  <td className="rk-td" style={{ color: "var(--rk-body)" }}>
                    {r.items ?? "—"}
                  </td>
                  <td className="rk-td">
                    <ResultChip result={r.result} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
