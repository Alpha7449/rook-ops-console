import { NextResponse } from "next/server";
import { setWorkflowOverride, logAudit } from "@/lib/db/repo";
import { workflowById } from "@/lib/registry";
import { setN8nActive } from "@/lib/adapters/n8n";
import { isLauncher, startLauncher } from "@/lib/adapters/launchers";
import { invalidate } from "@/lib/state";
import { getConfig } from "@/lib/config";
import type { Autonomy } from "@/lib/types";

interface Body {
  action?: "enable" | "disable" | "autonomy" | "run";
  autonomy?: Autonomy;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wf = workflowById(id);
  if (!wf) return NextResponse.json({ error: "unknown workflow" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as Body;

  switch (body.action) {
    case "enable":
    case "disable": {
      const enabled = body.action === "enable";
      await setWorkflowOverride(id, { enabled });
      // n8n workflows: mirror the toggle into n8n itself (the sender stays manual-trigger).
      if (wf.kind === "n8n" && id !== "outreach-sender") await setN8nActive(id, enabled);
      await logAudit(`workflow.${body.action}`, id);
      invalidate("n8n");
      return NextResponse.json({ ok: true });
    }
    case "autonomy": {
      if (body.autonomy !== "auto" && body.autonomy !== "review")
        return NextResponse.json({ error: "autonomy must be auto|review" }, { status: 400 });
      await setWorkflowOverride(id, { autonomy: body.autonomy });
      await logAudit("workflow.autonomy", id, body.autonomy);
      invalidate();
      return NextResponse.json({ ok: true });
    }
    case "run": {
      if (isLauncher(id)) {
        const run = await startLauncher(id);
        return NextResponse.json({ ok: true, launcher: run });
      }
      // n8n public API can't execute manual workflows; Odysseus runs start in its UI.
      const cfg = getConfig();
      const href = wf.kind === "n8n" ? cfg.services.n8nUrl : `${cfg.services.odysseusUrl}`;
      await logAudit("workflow.open", id, href);
      return NextResponse.json({ ok: true, href });
    }
    default:
      return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
}
