"use client";
// Unified run history: console + n8n executions + Odysseus agent runs.
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ResultChip, fmtDur, fmtTime } from "@/components/ui";
import { WORKFLOWS } from "@/lib/registry";
import type { RunRow } from "@/lib/types";

function HistoryInner() {
  const params = useSearchParams();
  const [rows, setRows] = useState<RunRow[] | null>(null);
  const [workflow, setWorkflow] = useState(params.get("workflow") ?? "");
  const [result, setResult] = useState("");
  const [source, setSource] = useState("");

  useEffect(() => {
    const q = workflow ? `?workflow=${encodeURIComponent(workflow)}` : "";
    let alive = true;
    void fetch(`/api/runs${q}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { runs: RunRow[] }) => {
        if (alive) setRows(d.runs);
      })
      .catch(() => setRows([]));
    return () => {
      alive = false;
    };
  }, [workflow]);

  const filtered = (rows ?? []).filter((r) => (!result || r.result === result) && (!source || r.source === source));

  return (
    <div className="rk-content">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ fontSize: 24, margin: 0, letterSpacing: "-0.015em" }}>Run history</h1>
          <div style={{ fontSize: 13, color: "var(--rk-mut)", marginTop: 3 }}>
            {rows ? `${filtered.length} runs · merged from console, n8n and Odysseus` : "loading…"}
          </div>
        </div>
        <select className="rk-select" style={{ width: "auto" }} value={workflow} onChange={(e) => setWorkflow(e.target.value)}>
          <option value="">All workflows</option>
          {WORKFLOWS.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
          <option value="system">System (gaming mode)</option>
        </select>
        <select className="rk-select" style={{ width: "auto" }} value={result} onChange={(e) => setResult(e.target.value)}>
          <option value="">Any result</option>
          <option value="ok">Success</option>
          <option value="warn">Needs review</option>
          <option value="err">Failed</option>
          <option value="run">Running</option>
        </select>
        <select className="rk-select" style={{ width: "auto" }} value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">Any source</option>
          <option value="console">Console</option>
          <option value="n8n">n8n</option>
          <option value="odysseus">Odysseus</option>
        </select>
      </div>

      <div className="rk-card rk-card-bd">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 760 }}>
            <thead>
              <tr>
                <th className="rk-th">Time</th>
                <th className="rk-th">Workflow</th>
                <th className="rk-th">Trigger</th>
                <th className="rk-th">Duration</th>
                <th className="rk-th">Output</th>
                <th className="rk-th">Source</th>
                <th className="rk-th">Result</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="rk-row" title={r.detail}>
                  <td className="rk-td" style={{ color: "var(--rk-mut)", whiteSpace: "nowrap" }}>
                    {fmtTime(r.ts)}
                  </td>
                  <td className="rk-td" style={{ fontWeight: 600 }}>
                    {r.workflowName}
                  </td>
                  <td className="rk-td" style={{ color: "var(--rk-body)", maxWidth: 340, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.trigger}
                  </td>
                  <td className="rk-td" style={{ color: "var(--rk-mut)" }}>
                    {fmtDur(r.durMs)}
                  </td>
                  <td className="rk-td" style={{ color: "var(--rk-body)" }}>
                    {r.items ?? "—"}
                  </td>
                  <td className="rk-td" style={{ color: "var(--rk-mut)" }}>
                    {r.source}
                  </td>
                  <td className="rk-td">
                    <ResultChip result={r.result} />
                  </td>
                </tr>
              ))}
              {rows && filtered.length === 0 && (
                <tr>
                  <td className="rk-td" colSpan={7} style={{ color: "var(--rk-mut)", padding: 20 }}>
                    No runs match the filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function HistoryPage() {
  return (
    <Suspense>
      <HistoryInner />
    </Suspense>
  );
}
