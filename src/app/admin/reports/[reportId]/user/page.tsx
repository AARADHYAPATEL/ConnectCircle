import {
  AdminPanel,
  AdminReportWorkspace,
  formatReportDate,
  ReportField,
} from "@/components/admin/AdminReportWorkspace";
import {
  getAdminReportPageData,
  type AdminReportRouteParams,
} from "@/app/admin/reports/[reportId]/reportPageData";
import { getUserNetworkRecordByUsername } from "@/lib/userNetworkStore";

type AdminReportedUserPageProps = {
  params: AdminReportRouteParams;
};

export default async function AdminReportedUserPage({
  params,
}: AdminReportedUserPageProps) {
  const { admin, report } = await getAdminReportPageData(params);
  const currentNetwork = await getUserNetworkRecordByUsername(
    report.reportedUsername,
  );
  const snapshot = report.reportedUserSnapshot;

  return (
    <AdminReportWorkspace activeSection="user" admin={admin} report={report}>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid gap-5">
          <AdminPanel eyebrow="Reported user" title="Account snapshot">
            {snapshot ? (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <ReportField label="User ID" value={snapshot.userId} />
                  <ReportField label="Username" value={`@${snapshot.username}`} />
                  <ReportField label="Email" value={snapshot.email} />
                  <ReportField
                    label="Display name"
                    value={snapshot.displayName || "Not set"}
                  />
                  <ReportField
                    label="Account created"
                    value={formatReportDate(snapshot.accountCreatedAt)}
                  />
                  <ReportField
                    label="Profile image"
                    value={snapshot.avatarImagePresent ? "Present" : "Not set"}
                  />
                  <ReportField
                    label="Profile visibility"
                    value={snapshot.profileVisibility}
                  />
                  <ReportField
                    label="Availability"
                    value={snapshot.availabilityStatus}
                  />
                </div>
                <div className="mt-6">
                  <p className="text-xs font-bold uppercase tracking-normal text-slate-500">
                    Bio
                  </p>
                  <p className="mt-2 whitespace-pre-wrap rounded-md bg-slate-50 p-4 leading-7 text-slate-700">
                    {snapshot.bio || "No bio was set."}
                  </p>
                </div>
              </>
            ) : (
              <p className="rounded-md bg-slate-50 p-4 text-sm font-semibold text-slate-600">
                No reported-user snapshot was captured for this report.
              </p>
            )}
          </AdminPanel>

          <AdminPanel eyebrow="Network" title="Snapshot network details">
            <div className="grid gap-4 md:grid-cols-2">
              <ReportField
                label="Last known IP"
                value={snapshot?.lastIp || "Not recorded"}
              />
              <ReportField
                label="Last seen"
                value={
                  snapshot?.lastSeenAt
                    ? formatReportDate(snapshot.lastSeenAt)
                    : "Not recorded"
                }
              />
              <ReportField
                label="User agent"
                value={snapshot?.lastUserAgent || "Not recorded"}
              />
              <ReportField
                label="Theme preference"
                value={snapshot?.themePreference || "Not recorded"}
              />
            </div>
          </AdminPanel>
        </div>

        <AdminPanel eyebrow="Current" title="Latest tracked network">
          <div className="grid gap-4">
            <ReportField
              label="Latest IP"
              value={currentNetwork?.lastIp || "Not recorded"}
            />
            <ReportField
              label="Latest seen"
              value={
                currentNetwork?.lastSeenAt
                  ? formatReportDate(currentNetwork.lastSeenAt)
                  : "Not recorded"
              }
            />
            <ReportField
              label="Latest user agent"
              value={currentNetwork?.lastUserAgent || "Not recorded"}
            />
          </div>
        </AdminPanel>
      </div>
    </AdminReportWorkspace>
  );
}
