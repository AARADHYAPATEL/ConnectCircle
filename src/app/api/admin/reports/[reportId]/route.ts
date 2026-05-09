import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/adminSession";
import {
  getSafetyReportById,
  updateSafetyReportStatus,
} from "@/lib/reportStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AdminReportRouteContext = {
  params: Promise<{
    reportId: string;
  }>;
};

export async function GET(_request: Request, context: AdminReportRouteContext) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json({ error: "Admin authentication required." }, { status: 401 });
  }

  const { reportId } = await context.params;
  const report = await getSafetyReportById(reportId);

  if (!report) {
    return NextResponse.json({ error: "Report could not be found." }, { status: 404 });
  }

  return NextResponse.json({ report });
}

export async function PATCH(request: Request, context: AdminReportRouteContext) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json({ error: "Admin authentication required." }, { status: 401 });
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

  const input = body as Record<string, unknown>;
  const { reportId } = await context.params;
  const result = await updateSafetyReportStatus(
    reportId,
    input.status,
    admin.username,
    input.resolutionNote,
  );

  if (result.error || !result.report) {
    return NextResponse.json(
      { error: result.error || "Report could not be updated." },
      { status: 400 },
    );
  }

  return NextResponse.json({ report: result.report });
}

