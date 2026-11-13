import { NextResponse } from "next/server";
import { buildSnapshot, ensurePoller } from "@/lib/state";

export async function GET() {
  ensurePoller();
  const snap = await buildSnapshot();
  return NextResponse.json(snap);
}
