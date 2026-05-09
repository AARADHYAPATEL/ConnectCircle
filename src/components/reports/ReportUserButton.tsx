"use client";

import { useCallback, useEffect, useState } from "react";
import {
  reportDetailsLimit,
  reportReasonOptions,
  type ReportContextType,
  type ReportReason,
} from "@/lib/reportTypes";

type ReportUserDialogProps = {
  contextId: string;
  contextType: ReportContextType;
  onOpenChange: (isOpen: boolean) => void;
  onSubmitted?: () => void;
  open: boolean;
  reportedUsername: string;
  subjectLabel?: string;
};

type ReportUserButtonProps = {
  className?: string;
  contextId: string;
  contextType: ReportContextType;
  label?: string;
  reportedUsername: string;
  subjectLabel?: string;
};

async function readErrorMessage(response: Response) {
  try {
    const data: { error?: string } = await response.json();

    return data.error || "Report could not be submitted.";
  } catch {
    return "Report could not be submitted.";
  }
}

function getContextLabel(contextType: ReportContextType) {
  switch (contextType) {
    case "dm_message":
      return "direct message";
    case "circle_message":
      return "CircleChat message";
    case "profile":
      return "profile";
  }
}

export function ReportUserDialog({
  contextId,
  contextType,
  onOpenChange,
  onSubmitted,
  open,
  reportedUsername,
  subjectLabel,
}: ReportUserDialogProps) {
  const [reason, setReason] = useState<ReportReason>("bullying_harassment");
  const [details, setDetails] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = useCallback(() => {
    setError("");
    setDetails("");
    setReason("bullying_harassment");
  }, []);

  const closeDialog = useCallback(() => {
    resetForm();
    onOpenChange(false);
  }, [onOpenChange, resetForm]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSubmitting) {
        closeDialog();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeDialog, isSubmitting, open]);

  if (!open) {
    return null;
  }

  async function submitReport() {
    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contextId,
          contextType,
          details,
          reason,
          reportedUsername,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      onSubmitted?.();
      closeDialog();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Report could not be submitted.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      aria-labelledby="report-dialog-title"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 px-4 py-6"
      role="dialog"
    >
      <div className="w-full max-w-lg rounded-md border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-950/20">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-normal text-rose-700">
              Report
            </p>
            <h2
              className="mt-1 text-2xl font-bold leading-tight text-slate-950"
              id="report-dialog-title"
            >
              Report {subjectLabel || `@${reportedUsername}`}
            </h2>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              {getContextLabel(contextType)}
            </p>
          </div>
          <button
            className="rounded-md px-2 py-1 text-sm font-black text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            disabled={isSubmitting}
            onClick={closeDialog}
            type="button"
          >
            Close
          </button>
        </div>

        <label className="mt-5 block">
          <span className="text-sm font-bold text-slate-800">Reason</span>
          <select
            className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
            disabled={isSubmitting}
            onChange={(event) => setReason(event.target.value as ReportReason)}
            value={reason}
          >
            {reportReasonOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-4 block">
          <span className="text-sm font-bold text-slate-800">
            Details optional
          </span>
          <textarea
            className="mt-2 min-h-28 w-full resize-none rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-rose-400 focus:bg-white focus:ring-2 focus:ring-rose-100"
            disabled={isSubmitting}
            maxLength={reportDetailsLimit}
            onChange={(event) => setDetails(event.target.value)}
            placeholder="Add anything moderators should know."
            value={details}
          />
        </label>

        <div className="mt-2 flex justify-end">
          <p className="text-xs font-semibold text-slate-500">
            {details.length}/{reportDetailsLimit}
          </p>
        </div>

        {error ? (
          <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-900">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button
            className="btn btn-secondary"
            disabled={isSubmitting}
            onClick={closeDialog}
            type="button"
          >
            Cancel
          </button>
          <button
            className="btn btn-danger"
            disabled={isSubmitting}
            onClick={() => void submitReport()}
            type="button"
          >
            {isSubmitting ? "Submitting..." : "Submit report"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ReportUserButton({
  className = "btn btn-secondary",
  contextId,
  contextType,
  label = "Report user",
  reportedUsername,
  subjectLabel,
}: ReportUserButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState("");

  return (
    <div className="grid gap-2">
      <button
        className={className}
        onClick={() => {
          setNotice("");
          setIsOpen(true);
        }}
        type="button"
      >
        {label}
      </button>
      {notice ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
          {notice}
        </p>
      ) : null}
      <ReportUserDialog
        contextId={contextId}
        contextType={contextType}
        onOpenChange={setIsOpen}
        onSubmitted={() =>
          setNotice("Report submitted. Thanks for helping keep ConnectCircle safe.")
        }
        open={isOpen}
        reportedUsername={reportedUsername}
        subjectLabel={subjectLabel}
      />
    </div>
  );
}
