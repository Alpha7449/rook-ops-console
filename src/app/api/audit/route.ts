import { NextResponse } from "next/server";
import { listAudit } from "@/lib/db/repo";

export async function GET() {
  return NextResponse.json({ rows: await listAudit(200) });
}
