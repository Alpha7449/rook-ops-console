"use client";
// Audit log — every state-changing console action.
import { useEffect, useState } from "react";
import { fmtTime } from "@/components/ui";

interface AuditRow {
  id: number;
  ts: number;
  actor: string;
  action: string;
  target?: string | null;
  detail?: string | null;
}

export default function AuditPage() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  useEffect(() => {
    void fetch("/api/audit", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { rows: AuditRow[] }) => setRows(d.rows))
      .catch(() => setRows([]));
  }, []);

  return (
    <div className="rk-content">
      <h1 style={{ fontSize: 24, margin: "0 0 4px", letterSpacing: "-0.015em" }}>Audit log</h1>
      <div style={{ fontSize: 13, color: "var(--rk-mut)", marginBottom: 18 }}>
        Every toggle, launch, approval and gaming-mode switch this console performed.
      </div>
      <div className="rk-card rk-card-bd">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th className="rk-th">Time</th>
              <th className="rk-th">Action</th>
              <th className="rk-th">Target</th>
              <th className="rk-th">Detail</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr key={r.id} className="rk-row">
                <td className="rk-td" style={{ color: "var(--rk-mut)", whiteSpace: "nowrap" }}>
                  {fmtTime(r.ts)}
                </td>
                <td className="rk-td" style={{ fontWeight: 600 }}>
                  {r.action}
                </td>
                <td className="rk-td" style={{ color: "var(--rk-body)" }}>
                  {r.target ?? "—"}
                </td>
                <td className="rk-td" style={{ color: "var(--rk-mut)", maxWidth: 480, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.detail ?? undefined}>
                  {r.detail ?? "—"}
                </td>
              </tr>
            ))}
            {rows && rows.length === 0 && (
              <tr>
                <td className="rk-td" colSpan={4} style={{ color: "var(--rk-mut)", padding: 20 }}>
                  Nothing logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
