import type { ReactNode } from "react";
import Link from "next/link";
import { AdminHeader } from "@/components/admin/AdminHeader";
import type { PublicAdminUser } from "@/lib/adminStore";
import {
  reportReasonOptions,
  type ReportContextType,
  type ReportReason,
  type ReportStatus,
  type SafetyReport,
} from "@/lib/reportTypes";

export type AdminReportSectionId =
  | "overview"
  | "user"
  | "evidence"
  | "moderation";

type AdminReportWorkspaceProps = {
  activeSection: AdminReportSectionId;
  admin: PublicAdminUser;
  children: ReactNode;
  report: SafetyReport;
};

type AdminPanelProps = {
  actions?: ReactNode;
  children: ReactNode;
  eyebrow: string;
  title: string;
};

type ReportFieldProps = {
  label: string;
  value: ReactNode;
};

const reportSections: Array<{
  id: AdminReportSectionId;
  href: (reportId: string) => string;
  label: string;
}> = [
  {
    id: "overview",
    href: (reportId) => `/admin/reports/${reportId}`,
    label: "Overview",
  },
  {
    id: "user",
    href: (reportId) => `/admin/reports/${reportId}/user`,
    label: "Reported user",
  },
  {
    id: "evidence",
    href: (reportId) => `/admin/reports/${reportId}/evidence`,
    label: "Evidence",
  },
  {
    id: "moderation",
    href: (reportId) => `/admin/reports/${reportId}/moderation`,
    label: "Moderation",
  },
];

export const statusLabels: Record<ReportStatus, string> = {
  open: "Open",
  reviewing: "Reviewing",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

export const statusClasses: Record<ReportStatus, string> = {
  open: "bg-rose-50 text-rose-800",
  reviewing: "bg-amber-50 text-amber-800",
  resolved: "bg-emerald-50 text-emerald-800",
  dismissed: "bg-slate-100 text-slate-700",
};

export function getReasonLabel(reason: ReportReason) {
  return (
    reportReasonOptions.find((option) => option.value === reason)?.label ??
    reason
  );
}

export function getContextLabel(contextType: ReportContextType) {
  switch (contextType) {
    case "profile":
      return "Profile";
    case "dm_message":
      return "Direct message";
    case "circle_message":
      return "CircleChat message";
  }
}

export function formatReportDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

export function formatReportShortDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function formatBytes(value: number) {
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(value / 1024))} KB`;
}

export function ReportField({ label, value }: ReportFieldProps) {
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

export function AdminPanel({
  actions,
  children,
  eyebrow,
  title,
}: AdminPanelProps) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-normal text-teal-700">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">{title}</h2>
        </div>
        {actions}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function AdminReportWorkspace({
  activeSection,
  admin,
  children,
  report,
}: AdminReportWorkspaceProps) {
  return (
    <main className="min-h-screen">
      <AdminHeader admin={admin} />
      <section className="mx-auto w-full max-w-7xl px-6 py-8">
        <Link className="btn btn-secondary btn-sm mb-5" href="/admin/reports">
          Back to reports
        </Link>

        <section className="motion-panel rounded-md border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0">
              <p className="text-sm font-semibold uppercase tracking-normal text-teal-700">
                Safety case
              </p>
              <h1 className="mt-2 break-all text-4xl font-black leading-tight text-slate-950">
                {report.id.slice(0, 8)}
              </h1>
              <p className="mt-2 break-all font-mono text-xs font-semibold text-slate-500">
                {report.id}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-md px-3 py-2 text-sm font-black ${statusClasses[report.status]}`}
              >
                {statusLabels[report.status]}
              </span>
              <a
                className="btn btn-primary btn-sm"
                href={`/api/admin/reports/${report.id}/download`}
              >
                Download file
              </a>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <ReportField
              label="Reported user"
              value={`@${report.reportedUsername}`}
            />
            <ReportField label="Reporter" value={`@${report.reporterUsername}`} />
            <ReportField label="Reason" value={getReasonLabel(report.reason)} />
            <ReportField
              label="Created"
              value={formatReportShortDate(report.createdAt)}
            />
          </div>
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="self-start rounded-md border border-slate-200 bg-white p-2 shadow-sm lg:sticky lg:top-5">
            <p className="px-3 py-2 text-xs font-bold uppercase tracking-normal text-slate-500">
              Case sections
            </p>
            <nav className="grid gap-1">
              {reportSections.map((section) => {
                const isActive = section.id === activeSection;

                return (
                  <Link
                    className={`rounded-md px-3 py-2 text-sm font-black transition ${
                      isActive
                        ? "bg-teal-50 text-teal-800"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                    }`}
                    href={section.href(report.id)}
                    key={section.id}
                  >
                    {section.label}
                  </Link>
                );
              })}
            </nav>
          </aside>

          <div className="min-w-0">{children}</div>
        </div>
      </section>
    </main>
  );
}
