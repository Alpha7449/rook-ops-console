import { NextResponse } from "next/server";
import { resumeRun } from "@/lib/adapters/odysseus";
import { kvSet, logAudit, resolveApproval } from "@/lib/db/repo";
import { invalidate } from "@/lib/state";

interface Body {
  action?: "approve" | "reject";
  feedback?: string;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Body;
  if (body.action !== "approve" && body.action !== "reject")
    return NextResponse.json({ error: "action must be approve|reject" }, { status: 400 });

  if (id.startsWith("ody-")) {
    const runId = id.slice(4);
    const ok = await resumeRun(runId, body.action === "approve" ? "approve" : "revise", body.feedback ?? "");
    await logAudit(`approval.${body.action}`, id, body.feedback);
    invalidate("ody");
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Odysseus resume failed" }, { status: 502 });
  }

  if (id.startsWith("outreach-")) {
    // Derived item: "approve" hands over to n8n (client opens the link); "reject" snoozes it.
    await kvSet(`dismiss:${id}`, String(Date.now()));
    await logAudit(`approval.${body.action}`, id);
    invalidate();
    return NextResponse.json({ ok: true });
  }

  await resolveApproval(id, body.action === "approve" ? "approved" : "rejected");
  await logAudit(`approval.${body.action}`, id);
  invalidate();
  return NextResponse.json({ ok: true });
}
