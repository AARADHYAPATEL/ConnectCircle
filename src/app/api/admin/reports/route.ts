import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/adminSession";
import { getSafetyReports } from "@/lib/reportStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json({ error: "Admin authentication required." }, { status: 401 });
  }

  const reports = await getSafetyReports();

  return NextResponse.json({ reports });
}

