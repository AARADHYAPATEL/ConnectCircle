import {
  AdminPanel,
  AdminReportWorkspace,
  formatBytes,
  formatReportDate,
  ReportField,
} from "@/components/admin/AdminReportWorkspace";
import {
  getAdminReportPageData,
  type AdminReportRouteParams,
} from "@/app/admin/reports/[reportId]/reportPageData";

type AdminReportEvidencePageProps = {
  params: AdminReportRouteParams;
};

export default async function AdminReportEvidencePage({
  params,
}: AdminReportEvidencePageProps) {
  const { admin, report } = await getAdminReportPageData(params);
  const snapshot = report.messageSnapshot;

  return (
    <AdminReportWorkspace activeSection="evidence" admin={admin} report={report}>
      <div className="grid gap-5">
        <AdminPanel
          actions={
            <a
              className="btn btn-secondary btn-sm"
              href={`/api/admin/reports/${report.id}/download`}
            >
              Download text file
            </a>
          }
          eyebrow="Evidence"
          title="Message snapshot"
        >
          {snapshot ? (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <ReportField label="Author" value={`@${snapshot.authorUsername}`} />
                <ReportField label="Message ID" value={snapshot.messageId} />
                <ReportField
                  label="Created"
                  value={formatReportDate(snapshot.createdAt)}
                />
                {snapshot.editedAt ? (
                  <ReportField
                    label="Edited"
                    value={formatReportDate(snapshot.editedAt)}
                  />
                ) : null}
                {snapshot.circleName ? (
                  <ReportField label="Circle" value={snapshot.circleName} />
                ) : null}
                {snapshot.circleId ? (
                  <ReportField label="Circle ID" value={snapshot.circleId} />
                ) : null}
              </div>

              <div className="mt-6">
                <p className="text-xs font-bold uppercase tracking-normal text-slate-500">
                  Message text
                </p>
                <p className="mt-2 whitespace-pre-wrap rounded-md bg-slate-50 p-4 leading-7 text-slate-700">
                  {snapshot.message || "No text in this message."}
                </p>
              </div>
            </>
          ) : (
            <p className="rounded-md bg-slate-50 p-4 text-sm font-semibold text-slate-600">
              This report does not include a message snapshot.
            </p>
          )}
        </AdminPanel>

        {snapshot?.mediaAttachment ? (
          <AdminPanel eyebrow="Attachment" title="Media snapshot">
            <div className="grid gap-4 md:grid-cols-2">
              <ReportField
                label="Kind"
                value={snapshot.mediaAttachment.kind}
              />
              <ReportField
                label="Type"
                value={snapshot.mediaAttachment.type}
              />
              <ReportField
                label="Name"
                value={snapshot.mediaAttachment.name}
              />
              <ReportField
                label="Size"
                value={formatBytes(snapshot.mediaAttachment.size)}
              />
            </div>
          </AdminPanel>
        ) : null}
      </div>
    </AdminReportWorkspace>
  );
}
