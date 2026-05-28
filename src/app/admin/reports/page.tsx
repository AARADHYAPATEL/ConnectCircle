import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { getCurrentAdmin } from "@/lib/adminSession";
import { getSafetyReports } from "@/lib/reportStore";
import {
  reportReasonOptions,
  type ReportContextType,
  type ReportReason,
  type ReportStatus,
  type SafetyReport,
} from "@/lib/reportTypes";

const statusLabels: Record<ReportStatus, string> = {
  open: "Open",
  reviewing: "Reviewing",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

const statusClasses: Record<ReportStatus, string> = {
  open: "bg-rose-50 text-rose-800",
  reviewing: "bg-amber-50 text-amber-800",
  resolved: "bg-emerald-50 text-emerald-800",
  dismissed: "bg-slate-100 text-slate-700",
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
      return "DM message";
    case "circle_message":
      return "CircleChat";
  }
}

function formatReportDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function getCountByStatus(reports: SafetyReport[], status: ReportStatus) {
  return reports.filter((report) => report.status === status).length;
}

export default async function AdminReportsPage() {
  const admin = await getCurrentAdmin();

  if (!admin) {
    redirect("/admin/login");
  }

  const reports = await getSafetyReports();

  return (
    <main className="min-h-screen">
      <AdminHeader admin={admin} />
      <section className="mx-auto w-full max-w-7xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-normal text-teal-700">
              Admin reports
            </p>
            <h1 className="mt-2 text-4xl font-bold leading-tight text-slate-950">
              Safety report review
            </h1>
          </div>
          <span className="rounded-md bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
            {reports.length} total
          </span>
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-4">
          {(["open", "reviewing", "resolved", "dismissed"] as const).map(
            (status) => (
              <div
                className="rounded-md border border-slate-200 bg-white p-4 shadow-sm"
                key={status}
              >
                <p className="text-xs font-bold uppercase tracking-normal text-slate-500">
                  {statusLabels[status]}
                </p>
                <p className="mt-2 text-3xl font-black text-slate-950">
                  {getCountByStatus(reports, status)}
                </p>
              </div>
            ),
          )}
        </div>

        <section className="motion-panel overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
          {reports.length === 0 ? (
            <p className="p-6 text-sm font-semibold text-slate-500">
              No reports have been submitted yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[58rem] border-collapse text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-normal text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Report</th>
                    <th className="px-4 py-3">Users</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3">Context</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((report) => (
                    <tr
                      className="border-b border-slate-100 last:border-0"
                      key={report.id}
                    >
                      <td className="px-4 py-3 font-bold text-slate-950">
                        <Link
                          className="text-teal-700 hover:text-teal-900"
                          href={`/admin/reports/${report.id}`}
                        >
                          {report.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-700">
                          Reported @{report.reportedUsername}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          By @{report.reporterUsername}
                        </p>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-700">
                        {getReasonLabel(report.reason)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-700">
                        {getContextLabel(report.contextType)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-md px-2 py-1 text-xs font-bold ${statusClasses[report.status]}`}
                        >
                          {statusLabels[report.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-500">
                        {formatReportDate(report.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Link
                            className="btn btn-secondary btn-sm"
                            href={`/admin/reports/${report.id}`}
                          >
                            Review
                          </Link>
                          <Link
                            className="btn btn-secondary btn-sm"
                            href={`/admin/reports/${report.id}/moderation`}
                          >
                            Moderate
                          </Link>
                          <a
                            className="btn btn-secondary btn-sm"
                            href={`/api/admin/reports/${report.id}/download`}
                          >
                            Download
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
