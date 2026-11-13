"use client";
// Client-side store: initial fetch + SSE live updates + actions + drawer state.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Snapshot } from "@/lib/types";

type Panel = { kind: "queue" } | { kind: "workflow"; id: string } | null;

interface ConsoleCtx {
  snap: Snapshot | null;
  connected: boolean;
  panel: Panel;
  openQueue: () => void;
  openWorkflow: (id: string) => void;
  closePanel: () => void;
  serviceAction: (id: string, action: "start" | "stop") => Promise<void>;
  workflowAction: (id: string, body: Record<string, unknown>) => Promise<{ href?: string }>;
  approvalAction: (id: string, action: "approve" | "reject", feedback?: string) => Promise<void>;
  setGaming: (active: boolean) => Promise<string | undefined>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<ConsoleCtx | null>(null);

export function useConsole(): ConsoleCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useConsole outside provider");
  return ctx;
}

export function ConsoleProvider({ children }: { children: ReactNode }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const esRef = useRef<EventSource | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/overview", { cache: "no-store" });
      if (res.ok) setSnap((await res.json()) as Snapshot);
    } catch {
      // server briefly unavailable
    }
  }, []);

  useEffect(() => {
    // No eager fetch here: /api/events replays the last snapshot on connect,
    // which doubles as the initial load (and keeps this effect setState-free).
    let cancelled = false;
    const connect = () => {
      if (cancelled) return;
      const es = new EventSource("/api/events");
      esRef.current = es;
      es.onopen = () => setConnected(true);
      es.onmessage = (ev) => {
        try {
          setSnap(JSON.parse(ev.data) as Snapshot);
        } catch {
          // partial frame
        }
      };
      es.onerror = () => {
        setConnected(false);
        es.close();
        setTimeout(connect, 4000);
      };
    };
    connect();
    return () => {
      cancelled = true;
      esRef.current?.close();
    };
  }, [refresh]);

  const post = useCallback(async (url: string, body: unknown): Promise<Record<string, unknown>> => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await res.json().catch(() => ({}))) as Record<string, unknown>;
  }, []);

  const serviceAction = useCallback(
    async (id: string, action: "start" | "stop") => {
      // optimistic status flip
      setSnap((s) =>
        s
          ? {
              ...s,
              services: {
                ...s.services,
                [id]: { status: action === "start" ? "starting" : "stopping" },
              },
            }
          : s,
      );
      await post(`/api/services/${id}`, { action });
      void refresh();
    },
    [post, refresh],
  );

  const workflowAction = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      if (body.action === "enable" || body.action === "disable") {
        const enabled = body.action === "enable";
        setSnap((s) =>
          s && s.workflows[id]
            ? {
                ...s,
                workflows: {
                  ...s.workflows,
                  [id]: { ...s.workflows[id], enabled, status: enabled ? "healthy" : "off" },
                },
              }
            : s,
        );
      }
      const out = await post(`/api/workflows/${id}`, body);
      void refresh();
      return out as { href?: string };
    },
    [post, refresh],
  );

  const approvalAction = useCallback(
    async (id: string, action: "approve" | "reject", feedback?: string) => {
      setSnap((s) => (s ? { ...s, approvals: s.approvals.filter((a) => a.id !== id) } : s));
      await post(`/api/approvals/${id}`, { action, feedback });
      void refresh();
    },
    [post, refresh],
  );

  const setGaming = useCallback(
    async (active: boolean) => {
      setSnap((s) => (s ? { ...s, gaming: { ...s.gaming, busy: true } } : s));
      const out = await post("/api/gaming", { active });
      void refresh();
      return (out as { report?: string }).report;
    },
    [post, refresh],
  );

  const value: ConsoleCtx = {
    snap,
    connected,
    panel,
    openQueue: () => setPanel({ kind: "queue" }),
    openWorkflow: (id) => setPanel({ kind: "workflow", id }),
    closePanel: () => setPanel(null),
    serviceAction,
    workflowAction,
    approvalAction,
    setGaming,
    refresh,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
