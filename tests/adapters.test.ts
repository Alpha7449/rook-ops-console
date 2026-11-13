import { describe, expect, it } from "vitest";
import { sparkFromExecs, execsToRuns, type N8nState } from "@/lib/adapters/n8n";
import { odysseusApprovals, odysseusRuns, type OdysseusState } from "@/lib/adapters/odysseus";
import { shatteredPattern } from "@/lib/ps";
import { fmtDur } from "@/components/ui";

describe("n8n sparkFromExecs", () => {
  it("buckets executions per day, oldest first", () => {
    const now = Date.now();
    const iso = (agoDays: number) => new Date(now - agoDays * 86_400_000 - 60_000).toISOString();
    const spark = sparkFromExecs([
      { id: "1", workflowId: "w", startedAt: iso(0) },
      { id: "2", workflowId: "w", startedAt: iso(0) },
      { id: "3", workflowId: "w", startedAt: iso(3) },
      { id: "4", workflowId: "w", startedAt: iso(9) }, // outside window
    ]);
    expect(spark).toHaveLength(7);
    expect(spark[6]).toBe(2); // today
    expect(spark[3]).toBe(1); // 3 days ago
    expect(spark.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it("handles missing data", () => {
    expect(sparkFromExecs(undefined)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});

describe("n8n execsToRuns", () => {
  it("normalizes status and duration", () => {
    const state: N8nState = {
      reachable: true,
      authed: true,
      byRegistry: {},
      execs: {
        "email-triage": [
          {
            id: "42",
            workflowId: "x",
            status: "success",
            startedAt: "2026-08-21T01:00:00.000Z",
            stoppedAt: "2026-08-21T01:00:12.000Z",
            mode: "trigger",
          },
          { id: "43", workflowId: "x", status: "error", startedAt: "2026-08-21T02:00:00.000Z" },
        ],
      },
    };
    const runs = execsToRuns(state, { "email-triage": "Email triage" });
    expect(runs).toHaveLength(2);
    expect(runs[0]).toMatchObject({ id: "n8n-42", workflowName: "Email triage", result: "ok", durMs: 12_000, trigger: "Trigger" });
    expect(runs[1].result).toBe("err");
  });
});

describe("odysseus mapping", () => {
  const state: OdysseusState = {
    reachable: true,
    authed: true,
    runs: [
      { id: "run-1", status: "awaiting_approval", input: "Build a pomodoro timer", awaiting_agent: "Planner", updated_at: "2026-08-21T03:00:00Z" },
      { id: "run-2", status: "complete", input: "Write docs", awaiting_agent: null, updated_at: "2026-08-20T03:00:00Z" },
      { id: "run-3", status: "error", input: "Broken", awaiting_agent: null, updated_at: null },
    ],
  };

  it("turns awaiting_approval runs into review-queue items", () => {
    const items = odysseusApprovals(state);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: "ody-run-1", workflowId: "agent-network", externalId: "run-1" });
    expect(items[0].title).toContain("Planner gate");
  });

  it("maps run statuses to results", () => {
    const rows = odysseusRuns(state);
    expect(rows.map((r) => r.result)).toEqual(["warn", "ok", "err"]);
  });
});

describe("shatteredPattern", () => {
  it("never contains the search string contiguously", () => {
    const pat = shatteredPattern("watchdog.ps1");
    expect(pat).not.toContain("watchdog.ps1");
    expect(pat.startsWith("('*' + ")).toBe(true);
  });

  it("escapes single quotes for PowerShell", () => {
    expect(shatteredPattern("o'brien")).toContain("''''".slice(0, 2));
  });
});

describe("fmtDur", () => {
  it("formats human-readable durations", () => {
    expect(fmtDur(undefined)).toBe("—");
    expect(fmtDur(800)).toBe("800 ms");
    expect(fmtDur(12_000)).toBe("12s");
    expect(fmtDur(95_000)).toBe("1m 35s");
    expect(fmtDur(7_500_000)).toBe("2h 5m");
  });
});
