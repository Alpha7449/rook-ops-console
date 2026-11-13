import { NextResponse } from "next/server";
import { ensurePoller, fullRunHistory } from "@/lib/state";

export async function GET(request: Request) {
  ensurePoller();
  const url = new URL(request.url);
  const workflow = url.searchParams.get("workflow") ?? undefined;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "300", 10) || 300, 500);
  const rows = (await fullRunHistory(500)).filter((r) => !workflow || r.workflowId === workflow).slice(0, limit);
  return NextResponse.json({ runs: rows });
}
