"use client";

import Link from "next/link";
import { useState } from "react";
import {
  reportDetailsLimit,
  reportReasonOptions,
  type ReportReason,
} from "@/lib/reportTypes";

type ReportUserPageFormProps = {
  reportedUsername: string;
  returnHref: string;
};

async function readErrorMessage(response: Response) {
  try {
    const data: { error?: string } = await response.json();

    return data.error || "Report could not be submitted.";
  } catch {
    return "Report could not be submitted.";
  }
}

export function ReportUserPageForm({
  reportedUsername,
  returnHref,
}: ReportUserPageFormProps) {
  const [reason, setReason] = useState<ReportReason>("bullying_harassment");
  const [details, setDetails] = useState("");
  const [error, setError] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
          contextId: reportedUsername,
          contextType: "profile",
          details,
          reason,
          reportedUsername,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      setIsSubmitted(true);
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

  if (isSubmitted) {
    return (
      <article className="motion-panel rounded-md border border-emerald-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-normal text-emerald-700">
          Report submitted
        </p>
        <h1 className="mt-2 text-3xl font-bold leading-tight text-slate-950">
          Thanks for helping keep ConnectCircle safe.
        </h1>
        <p className="mt-3 leading-7 text-slate-700">
          Your report about @{reportedUsername} has been saved privately for
          review.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="btn btn-primary" href={returnHref}>
            Back to profile
          </Link>
          <Link className="btn btn-secondary" href="/social">
            Social home
          </Link>
        </div>
      </article>
    );
  }

  return (
    <article className="motion-panel rounded-md border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-normal text-rose-700">
        Report
      </p>
      <h1 className="mt-2 break-words text-4xl font-bold leading-tight text-slate-950">
        Report @{reportedUsername}
      </h1>
      <p className="mt-3 leading-7 text-slate-700">
        Reports are private. The person you report will not see who submitted
        it.
      </p>

      <label className="mt-6 block">
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

      <label className="mt-5 block">
        <span className="text-sm font-bold text-slate-800">
          Details optional
        </span>
        <textarea
          className="mt-2 min-h-40 w-full resize-none rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-rose-400 focus:bg-white focus:ring-2 focus:ring-rose-100"
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

      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Link className="btn btn-secondary" href={returnHref}>
          Cancel
        </Link>
        <button
          className="btn btn-danger"
          disabled={isSubmitting}
          onClick={() => void submitReport()}
          type="button"
        >
          {isSubmitting ? "Submitting..." : "Submit report"}
        </button>
      </div>
    </article>
  );
}

