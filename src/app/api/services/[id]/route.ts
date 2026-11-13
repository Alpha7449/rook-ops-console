import { NextResponse } from "next/server";
import { startService, stopService } from "@/lib/adapters/services";
import { serviceById } from "@/lib/registry";
import { invalidate } from "@/lib/state";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!serviceById(id)) return NextResponse.json({ error: "unknown service" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  if (body.action === "start") await startService(id);
  else if (body.action === "stop") await stopService(id);
  else return NextResponse.json({ error: "action must be start|stop" }, { status: 400 });
  invalidate();
  return NextResponse.json({ ok: true });
}
