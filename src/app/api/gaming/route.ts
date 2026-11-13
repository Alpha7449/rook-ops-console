import { NextResponse } from "next/server";
import { enterGamingMode, exitGamingMode, gamingState } from "@/lib/adapters/services";
import { invalidate } from "@/lib/state";

export async function GET() {
  return NextResponse.json(await gamingState());
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { active?: boolean };
  if (typeof body.active !== "boolean") return NextResponse.json({ error: "active must be boolean" }, { status: 400 });
  const current = await gamingState();
  if (current.busy) return NextResponse.json({ error: "already switching" }, { status: 409 });
  const report = body.active ? await enterGamingMode() : await exitGamingMode();
  invalidate();
  return NextResponse.json({ ok: true, report });
}
