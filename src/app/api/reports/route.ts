import { NextResponse } from "next/server";
import { createSafetyReport } from "@/lib/reportStore";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const reportRequest = body as Record<string, unknown>;
  const report = await createSafetyReport(user.username, {
    contextId: reportRequest.contextId,
    contextType: reportRequest.contextType,
    details: reportRequest.details,
    reason: reportRequest.reason,
    reportedUsername: reportRequest.reportedUsername,
  });

  if (report.error || !report.report) {
    return NextResponse.json(
      { error: report.error || "Report could not be submitted." },
      { status: report.duplicate ? 409 : 400 },
    );
  }

  return NextResponse.json({ report: report.report });
}
