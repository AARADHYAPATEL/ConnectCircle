import { AdminReportStatusForm } from "@/components/admin/AdminReportStatusForm";
import {
  AdminPanel,
  AdminReportWorkspace,
  formatReportDate,
  getContextLabel,
  getReasonLabel,
  ReportField,
  statusLabels,
} from "@/components/admin/AdminReportWorkspace";
import {
  getAdminReportPageData,
  type AdminReportRouteParams,
} from "@/app/admin/reports/[reportId]/reportPageData";

type AdminReportOverviewPageProps = {
  params: AdminReportRouteParams;
};

export default async function AdminReportOverviewPage({
  params,
}: AdminReportOverviewPageProps) {
  const { admin, report } = await getAdminReportPageData(params);

  return (
    <AdminReportWorkspace
      activeSection="overview"
      admin={admin}
      report={report}
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="grid gap-5">
          <AdminPanel eyebrow="Overview" title="Report information">
            <div className="grid gap-4 md:grid-cols-2">
              <ReportField label="Status" value={statusLabels[report.status]} />
              <ReportField label="Reason" value={getReasonLabel(report.reason)} />
              <ReportField
                label="Context"
                value={getContextLabel(report.contextType)}
              />
              <ReportField
                label="Context ID"
                value={report.contextId || "Not recorded"}
              />
              <ReportField
                label="Reported user"
                value={`@${report.reportedUsername}`}
              />
              <ReportField
                label="Reporter"
                value={`@${report.reporterUsername}`}
              />
              <ReportField
                label="Created"
                value={formatReportDate(report.createdAt)}
              />
              <ReportField
                label="Reporter IP"
                value={report.reporterIp || "Not recorded"}
              />
            </div>
            <div className="mt-6">
              <p className="text-xs font-bold uppercase tracking-normal text-slate-500">
                Details
              </p>
              <p className="mt-2 whitespace-pre-wrap rounded-md bg-slate-50 p-4 leading-7 text-slate-700">
                {report.details || "No details were provided."}
              </p>
            </div>
          </AdminPanel>

          <AdminPanel eyebrow="Reporter" title="Request metadata">
            <div className="grid gap-4 md:grid-cols-2">
              <ReportField
                label="Reporter IP"
                value={report.reporterIp || "Not recorded"}
              />
              <ReportField
                label="User agent"
                value={report.reporterUserAgent || "Not recorded"}
              />
            </div>
          </AdminPanel>
        </div>

        <div className="grid content-start gap-5">
          <AdminReportStatusForm
            initialNote={report.resolutionNote ?? ""}
            initialStatus={report.status}
            reportId={report.id}
          />

          <AdminPanel eyebrow="Review" title="Metadata">
            <div className="grid gap-4">
              <ReportField
                label="Reviewed by"
                value={report.reviewedBy ? `@${report.reviewedBy}` : "Not reviewed"}
              />
              <ReportField
                label="Reviewed at"
                value={
                  report.reviewedAt
                    ? formatReportDate(report.reviewedAt)
                    : "Not reviewed"
                }
              />
            </div>
          </AdminPanel>
        </div>
      </div>
    </AdminReportWorkspace>
  );
}
