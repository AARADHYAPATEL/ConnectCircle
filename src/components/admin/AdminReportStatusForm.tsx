"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { reportStatuses, type ReportStatus } from "@/lib/reportTypes";

type AdminReportStatusFormProps = {
  initialNote: string;
  initialStatus: ReportStatus;
  reportId: string;
};

const statusLabels: Record<ReportStatus, string> = {
  open: "Open",
  reviewing: "Reviewing",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

async function readErrorMessage(response: Response) {
  try {
    const data: { error?: string } = await response.json();

    return data.error || "Report could not be updated.";
  } catch {
    return "Report could not be updated.";
  }
}

export function AdminReportStatusForm({
  initialNote,
  initialStatus,
  reportId,
}: AdminReportStatusFormProps) {
  const router = useRouter();
  const [status, setStatus] = useState<ReportStatus>(initialStatus);
  const [resolutionNote, setResolutionNote] = useState(initialNote);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function updateStatus() {
    setIsSubmitting(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/admin/reports/${reportId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resolutionNote,
          status,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      setNotice("Report status updated.");
      router.refresh();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Report could not be updated.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-normal text-slate-500">
        Review status
      </p>
      <label className="mt-4 block text-sm font-bold text-slate-800">
        Status
        <select
          className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          disabled={isSubmitting}
          onChange={(event) => setStatus(event.target.value as ReportStatus)}
          value={status}
        >
          {reportStatuses.map((reportStatus) => (
            <option key={reportStatus} value={reportStatus}>
              {statusLabels[reportStatus]}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-4 block text-sm font-bold text-slate-800">
        Internal note
        <textarea
          className="mt-2 min-h-28 w-full resize-none rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-100"
          disabled={isSubmitting}
          maxLength={1000}
          onChange={(event) => setResolutionNote(event.target.value)}
          placeholder="Add a resolution note for admins."
          value={resolutionNote}
        />
      </label>
      {error ? (
        <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-900">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
          {notice}
        </p>
      ) : null}
      <button
        className="btn btn-primary mt-4"
        disabled={isSubmitting}
        onClick={() => void updateStatus()}
        type="button"
      >
        {isSubmitting ? "Saving..." : "Save status"}
      </button>
    </section>
  );
}

