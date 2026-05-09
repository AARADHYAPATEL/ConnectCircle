import { getCurrentAdmin } from "@/lib/adminSession";
import {
  formatSafetyReportText,
  getSafetyReportById,
} from "@/lib/reportStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AdminReportDownloadRouteContext = {
  params: Promise<{
    reportId: string;
  }>;
};

function cleanFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 96);
}

export async function GET(
  _request: Request,
  context: AdminReportDownloadRouteContext,
) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return Response.json(
      { error: "Admin authentication required." },
      { status: 401 },
    );
  }

  const { reportId } = await context.params;
  const report = await getSafetyReportById(reportId);

  if (!report) {
    return Response.json({ error: "Report could not be found." }, { status: 404 });
  }

  const fileName = `connectcircle-report-${cleanFileName(report.id)}.txt`;

  return new Response(formatSafetyReportText(report), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

