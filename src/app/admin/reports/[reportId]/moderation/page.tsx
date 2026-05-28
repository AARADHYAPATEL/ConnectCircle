import { AdminReportActionPanel } from "@/components/admin/AdminReportActionPanel";
import {
  AdminPanel,
  AdminReportWorkspace,
  ReportField,
} from "@/components/admin/AdminReportWorkspace";
import {
  getAdminReportPageData,
  type AdminReportRouteParams,
} from "@/app/admin/reports/[reportId]/reportPageData";
import { getModerationRecordsByReportId } from "@/lib/moderationStore";
import { getUserNetworkRecordByUsername } from "@/lib/userNetworkStore";

type AdminReportModerationPageProps = {
  params: AdminReportRouteParams;
};

export default async function AdminReportModerationPage({
  params,
}: AdminReportModerationPageProps) {
  const { admin, report } = await getAdminReportPageData(params);
  const [actions, reportedUserNetwork] = await Promise.all([
    getModerationRecordsByReportId(report.id),
    getUserNetworkRecordByUsername(report.reportedUsername),
  ]);
  const activeActions = actions.filter((action) => action.active).length;

  return (
    <AdminReportWorkspace
      activeSection="moderation"
      admin={admin}
      report={report}
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <AdminReportActionPanel
          actions={actions}
          reportedUserIp={
            report.reportedUserSnapshot?.lastIp ?? reportedUserNetwork?.lastIp
          }
          reportedUsername={report.reportedUsername}
          reporterIp={report.reporterIp}
          reportId={report.id}
        />

        <AdminPanel eyebrow="Targets" title="Action context">
          <div className="grid gap-4">
            <ReportField
              label="Active actions"
              value={`${activeActions} active`}
            />
            <ReportField
              label="Reported user"
              value={`@${report.reportedUsername}`}
            />
            <ReportField
              label="Reported user IP"
              value={
                report.reportedUserSnapshot?.lastIp ??
                reportedUserNetwork?.lastIp ??
                "Not recorded"
              }
            />
            <ReportField
              label="Reporter IP"
              value={report.reporterIp || "Not recorded"}
            />
          </div>
        </AdminPanel>
      </div>
    </AdminReportWorkspace>
  );
}
