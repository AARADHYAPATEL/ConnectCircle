import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { AdminReportActionPanel } from "@/components/admin/AdminReportActionPanel";
import { AdminReportStatusForm } from "@/components/admin/AdminReportStatusForm";
import { getCurrentAdmin } from "@/lib/adminSession";
import { getModerationRecordsByReportId } from "@/lib/moderationStore";
import { getSafetyReportById } from "@/lib/reportStore";
import { getUserNetworkRecordByUsername } from "@/lib/userNetworkStore";
import {
  reportReasonOptions,
  type ReportContextType,
  type ReportReason,
  type ReportStatus,
} from "@/lib/reportTypes";

type AdminReportDetailPageProps = {
  params: Promise<{
    reportId: string;
  }>;
};

const statusLabels: Record<ReportStatus, string> = {
  open: "Open",
  reviewing: "Reviewing",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

function getReasonLabel(reason: ReportReason) {
  return (
    reportReasonOptions.find((option) => option.value === reason)?.label ??
    reason
  );
}

function getContextLabel(contextType: ReportContextType) {
  switch (contextType) {
    case "profile":
      return "Profile";
    case "dm_message":
      return "Direct message";
    case "circle_message":
      return "CircleChat message";
  }
}

function formatReportDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function formatBytes(value: number) {
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(value / 1024))} KB`;
}

export default async function AdminReportDetailPage({
  params,
}: AdminReportDetailPageProps) {
  const [{ reportId }, admin] = await Promise.all([params, getCurrentAdmin()]);

  if (!admin) {
    redirect("/admin/login");
  }

  const report = await getSafetyReportById(reportId);

  if (!report) {
    notFound();
  }

  const [moderationActions, reportedUserNetwork] = await Promise.all([
    getModerationRecordsByReportId(report.id),
    getUserNetworkRecordByUsername(report.reportedUsername),
  ]);

  return (
    <main className="min-h-screen">
      <AdminHeader admin={admin} />
      <section className="mx-auto w-full max-w-7xl px-6 py-8">
        <Link className="btn btn-secondary btn-sm mb-5" href="/admin/reports">
          Back to reports
        </Link>

        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-normal text-teal-700">
              Report detail
            </p>
            <h1 className="mt-2 break-all text-4xl font-bold leading-tight text-slate-950">
              {report.id}
            </h1>
          </div>
          <a
            className="btn btn-primary"
            href={`/api/admin/reports/${report.id}/download`}
          >
            Download text file
          </a>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="grid gap-5">
            <section className="motion-panel rounded-md border border-slate-200 bg-white p-6 shadow-sm">
              <div className="grid gap-4 md:grid-cols-2">
                <ReportField label="Status" value={statusLabels[report.status]} />
                <ReportField label="Reason" value={getReasonLabel(report.reason)} />
                <ReportField
                  label="Reported user"
                  value={`@${report.reportedUsername}`}
                />
                <ReportField
                  label="Reporter"
                  value={`@${report.reporterUsername}`}
                />
                {report.reporterIp ? (
                  <ReportField label="Reporter IP" value={report.reporterIp} />
                ) : null}
                <ReportField
                  label="Context"
                  value={getContextLabel(report.contextType)}
                />
                <ReportField
                  label="Created"
                  value={formatReportDate(report.createdAt)}
                />
              </div>

              <div className="mt-6">
                <p className="text-sm font-semibold uppercase tracking-normal text-slate-500">
                  Details
                </p>
                <p className="mt-2 whitespace-pre-wrap rounded-md bg-slate-50 p-4 leading-7 text-slate-700">
                  {report.details || "No details were provided."}
                </p>
              </div>
            </section>

            {report.reportedUserSnapshot ? (
              <section className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-normal text-slate-500">
                  Reported user snapshot
                </p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <ReportField
                    label="User ID"
                    value={report.reportedUserSnapshot.userId}
                  />
                  <ReportField
                    label="Username"
                    value={`@${report.reportedUserSnapshot.username}`}
                  />
                  <ReportField
                    label="Email"
                    value={report.reportedUserSnapshot.email}
                  />
                  <ReportField
                    label="Display name"
                    value={report.reportedUserSnapshot.displayName || "Not set"}
                  />
                  <ReportField
                    label="Account created"
                    value={formatReportDate(
                      report.reportedUserSnapshot.accountCreatedAt,
                    )}
                  />
                  <ReportField
                    label="Last known IP"
                    value={report.reportedUserSnapshot.lastIp || "Not recorded"}
                  />
                  <ReportField
                    label="Last seen"
                    value={
                      report.reportedUserSnapshot.lastSeenAt
                        ? formatReportDate(report.reportedUserSnapshot.lastSeenAt)
                        : "Not recorded"
                    }
                  />
                  <ReportField
                    label="Profile visibility"
                    value={report.reportedUserSnapshot.profileVisibility}
                  />
                  <ReportField
                    label="Availability"
                    value={report.reportedUserSnapshot.availabilityStatus}
                  />
                  <ReportField
                    label="Theme"
                    value={report.reportedUserSnapshot.themePreference}
                  />
                  <ReportField
                    label="Profile image"
                    value={
                      report.reportedUserSnapshot.avatarImagePresent
                        ? "Present"
                        : "Not set"
                    }
                  />
                  <ReportField
                    label="User agent"
                    value={
                      report.reportedUserSnapshot.lastUserAgent || "Not recorded"
                    }
                  />
                </div>
                <div className="mt-5">
                  <p className="text-xs font-bold uppercase tracking-normal text-slate-500">
                    Bio
                  </p>
                  <p className="mt-2 whitespace-pre-wrap rounded-md bg-slate-50 p-4 leading-7 text-slate-700">
                    {report.reportedUserSnapshot.bio || "No bio was set."}
                  </p>
                </div>
              </section>
            ) : null}

            {report.messageSnapshot ? (
              <section className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-normal text-slate-500">
                  Message snapshot
                </p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <ReportField
                    label="Author"
                    value={`@${report.messageSnapshot.authorUsername}`}
                  />
                  <ReportField
                    label="Message ID"
                    value={report.messageSnapshot.messageId}
                  />
                  <ReportField
                    label="Created"
                    value={formatReportDate(report.messageSnapshot.createdAt)}
                  />
                  {report.messageSnapshot.editedAt ? (
                    <ReportField
                      label="Edited"
                      value={formatReportDate(report.messageSnapshot.editedAt)}
                    />
                  ) : null}
                  {report.messageSnapshot.circleName ? (
                    <ReportField
                      label="Circle"
                      value={report.messageSnapshot.circleName}
                    />
                  ) : null}
                </div>
                <p className="mt-5 whitespace-pre-wrap rounded-md bg-slate-50 p-4 leading-7 text-slate-700">
                  {report.messageSnapshot.message || "No text in this message."}
                </p>
                {report.messageSnapshot.mediaAttachment ? (
                  <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-bold text-slate-900">
                      Media attachment
                    </p>
                    <div className="mt-3 grid gap-3 text-sm font-semibold text-slate-600 md:grid-cols-2">
                      <span>Kind: {report.messageSnapshot.mediaAttachment.kind}</span>
                      <span>Type: {report.messageSnapshot.mediaAttachment.type}</span>
                      <span>Name: {report.messageSnapshot.mediaAttachment.name}</span>
                      <span>
                        Size: {formatBytes(report.messageSnapshot.mediaAttachment.size)}
                      </span>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>

          <div className="grid content-start gap-5">
            <AdminReportActionPanel
              actions={moderationActions}
              reportedUserIp={
                report.reportedUserSnapshot?.lastIp ?? reportedUserNetwork?.lastIp
              }
              reportedUsername={report.reportedUsername}
              reporterIp={report.reporterIp}
              reportId={report.id}
            />

            <AdminReportStatusForm
              initialNote={report.resolutionNote ?? ""}
              initialStatus={report.status}
              reportId={report.id}
            />

            <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold uppercase tracking-normal text-slate-500">
                Review metadata
              </p>
              <div className="mt-4 grid gap-4">
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
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}

function ReportField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-normal text-slate-500">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-bold text-slate-900">
        {value}
      </p>
    </div>
  );
}
