import { notFound, redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/adminSession";
import { getSafetyReportById } from "@/lib/reportStore";

export type AdminReportRouteParams = Promise<{
  reportId: string;
}>;

export async function getAdminReportPageData(params: AdminReportRouteParams) {
  const [{ reportId }, admin] = await Promise.all([params, getCurrentAdmin()]);

  if (!admin) {
    redirect("/admin/login");
  }

  const report = await getSafetyReportById(reportId);

  if (!report) {
    notFound();
  }

  return {
    admin,
    report,
  };
}
