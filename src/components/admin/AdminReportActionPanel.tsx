"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  getModerationActionLabel,
  type ModerationActionType,
  type ModerationRecord,
} from "@/lib/moderationTypes";

type AdminReportActionPanelProps = {
  actions: ModerationRecord[];
  reportedUserIp?: string;
  reportedUsername: string;
  reporterIp?: string;
  reportId: string;
};

const actionOptions: Array<{
  label: string;
  value: ModerationActionType;
}> = [
  { label: "Restrict reported user", value: "restrict_user" },
  { label: "Ban reported user", value: "ban_user" },
  { label: "Delete reported account", value: "delete_user" },
  { label: "Ban IP address", value: "ban_ip" },
];

const durationOptions = [
  { label: "No expiration", value: "" },
  { label: "24 hours", value: "24h" },
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
];

async function readErrorMessage(response: Response) {
  try {
    const data: { error?: string } = await response.json();

    return data.error || "Moderation action could not be applied.";
  } catch {
    return "Moderation action could not be applied.";
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function isRecordActive(record: ModerationRecord) {
  return (
    record.active &&
    (!record.expiresAt || new Date(record.expiresAt).getTime() > Date.now())
  );
}

export function AdminReportActionPanel({
  actions,
  reportedUserIp,
  reportedUsername,
  reporterIp,
  reportId,
}: AdminReportActionPanelProps) {
  const router = useRouter();
  const defaultIp = reportedUserIp || reporterIp || "";
  const [type, setType] = useState<ModerationActionType>("restrict_user");
  const [targetIp, setTargetIp] = useState(defaultIp);
  const [expiresIn, setExpiresIn] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [liftingRecordId, setLiftingRecordId] = useState("");
  const [liftReason, setLiftReason] = useState("");
  const [isLifting, setIsLifting] = useState(false);
  const canSubmit =
    !isSubmitting &&
    !isLifting &&
    confirmed &&
    reason.trim().length >= 3 &&
    (type !== "ban_ip" || targetIp.trim().length > 0);
  const latestAction = useMemo(() => actions[0], [actions]);

  async function applyAction() {
    if (!canSubmit) {
      return;
    }

    setIsSubmitting(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/admin/reports/${reportId}/actions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          confirmed,
          expiresIn,
          note,
          reason,
          targetIp,
          type,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      setNotice("Moderation action applied.");
      setReason("");
      setNote("");
      setConfirmed(false);
      router.refresh();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Moderation action could not be applied.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function liftAction(recordId: string) {
    if (liftReason.trim().length < 3 || isLifting) {
      return;
    }

    setIsLifting(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/admin/reports/${reportId}/actions`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason: liftReason,
          recordId,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      setNotice("Moderation action lifted.");
      setLiftReason("");
      setLiftingRecordId("");
      router.refresh();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Moderation action could not be lifted.",
      );
    } finally {
      setIsLifting(false);
    }
  }

  return (
    <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-normal text-teal-700">
            Moderation
          </p>
          <h2 className="mt-1 text-xl font-black text-slate-950">
            Take action
          </h2>
        </div>
        {latestAction ? (
          <span
            className={`rounded-md px-2 py-1 text-xs font-bold ${
              isRecordActive(latestAction)
                ? "bg-rose-50 text-rose-800"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {isRecordActive(latestAction) ? "Active" : "Inactive"}
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4">
        <label className="block text-sm font-bold text-slate-800">
          Action
          <select
            className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            disabled={isSubmitting}
            onChange={(event) => {
              const nextType = event.target.value as ModerationActionType;
              setType(nextType);
              if (nextType === "ban_ip" && !targetIp) {
                setTargetIp(defaultIp);
              }
            }}
            value={type}
          >
            {actionOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-600">
          <div className="flex items-center justify-between gap-3">
            <span>Reported user</span>
            <strong className="break-all text-slate-900">@{reportedUsername}</strong>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>Reported user IP</span>
            <strong className="break-all text-slate-900">
              {reportedUserIp || "Not recorded"}
            </strong>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>Reporter IP</span>
            <strong className="break-all text-slate-900">
              {reporterIp || "Not recorded"}
            </strong>
          </div>
        </div>

        {type === "ban_ip" ? (
          <label className="block text-sm font-bold text-slate-800">
            IP address
            <input
              className="mt-2 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-100"
              disabled={isSubmitting}
              onChange={(event) => setTargetIp(event.target.value)}
              placeholder="203.0.113.42"
              value={targetIp}
            />
          </label>
        ) : null}

        {type !== "delete_user" ? (
          <label className="block text-sm font-bold text-slate-800">
            Duration
            <select
              className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              disabled={isSubmitting}
              onChange={(event) => setExpiresIn(event.target.value)}
              value={expiresIn}
            >
              {durationOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="block text-sm font-bold text-slate-800">
          Reason
          <input
            className="mt-2 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-100"
            disabled={isSubmitting}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Policy violation, spam, harassment..."
            value={reason}
          />
        </label>

        <label className="block text-sm font-bold text-slate-800">
          Internal note
          <textarea
            className="mt-2 min-h-24 w-full resize-none rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-100"
            disabled={isSubmitting}
            maxLength={1000}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional admin context."
            value={note}
          />
        </label>

        <label className="flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">
          <input
            checked={confirmed}
            className="mt-0.5 h-4 w-4 shrink-0 accent-teal-700"
            disabled={isSubmitting}
            onChange={(event) => setConfirmed(event.target.checked)}
            type="checkbox"
          />
          <span>I understand this changes account access.</span>
        </label>
      </div>

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
        className={type === "restrict_user" ? "btn btn-primary mt-4" : "btn btn-danger mt-4"}
        disabled={!canSubmit}
        onClick={() => void applyAction()}
        type="button"
      >
        {isSubmitting ? "Applying..." : getModerationActionLabel(type)}
      </button>

      {actions.length > 0 ? (
        <div className="mt-6 border-t border-slate-200 pt-4">
          <p className="text-xs font-bold uppercase tracking-normal text-slate-500">
            Action history
          </p>
          <div className="mt-3 grid gap-3">
            {actions.map((action) => (
              <article
                className="rounded-md border border-slate-200 bg-slate-50 p-3"
                key={action.id}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-black text-slate-900">
                    {getModerationActionLabel(action.type)}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-md px-2 py-1 text-xs font-bold ${
                        isRecordActive(action)
                          ? "bg-rose-50 text-rose-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {isRecordActive(action) ? "Active" : "Inactive"}
                    </span>
                    <span className="rounded-md bg-white px-2 py-1 text-xs font-bold text-slate-600">
                      {formatDate(action.createdAt)}
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-700">
                  {action.type === "ban_ip"
                    ? action.targetIp
                    : action.targetUsername
                      ? `@${action.targetUsername}`
                      : "Unknown target"}
                </p>
                <p className="mt-2 text-sm text-slate-600">{action.reason}</p>
                {action.expiresAt ? (
                  <p className="mt-2 text-xs font-bold uppercase tracking-normal text-slate-500">
                    Expires {formatDate(action.expiresAt)}
                  </p>
                ) : null}
                {action.deactivatedAt ? (
                  <div className="mt-3 rounded-md border border-slate-200 bg-white p-3 text-xs font-semibold text-slate-600">
                    <p>
                      Lifted by @{action.deactivatedBy || "unknown"} on{" "}
                      {formatDate(action.deactivatedAt)}
                    </p>
                    {action.deactivationReason ? (
                      <p className="mt-1 text-slate-500">
                        {action.deactivationReason}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {isRecordActive(action) && action.type !== "delete_user" ? (
                  liftingRecordId === action.id ? (
                    <div className="mt-3 rounded-md border border-slate-200 bg-white p-3">
                      <label className="block text-xs font-bold uppercase tracking-normal text-slate-500">
                        Lift reason
                        <input
                          className="mt-2 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-100"
                          disabled={isLifting}
                          maxLength={500}
                          onChange={(event) => setLiftReason(event.target.value)}
                          placeholder="Restriction no longer needed..."
                          value={liftReason}
                        />
                      </label>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={isLifting || liftReason.trim().length < 3}
                          onClick={() => void liftAction(action.id)}
                          type="button"
                        >
                          {isLifting ? "Lifting..." : "Lift action"}
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={isLifting}
                          onClick={() => {
                            setLiftingRecordId("");
                            setLiftReason("");
                          }}
                          type="button"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="btn btn-secondary btn-sm mt-3"
                      disabled={isLifting || isSubmitting}
                      onClick={() => {
                        setLiftingRecordId(action.id);
                        setLiftReason("");
                      }}
                      type="button"
                    >
                      Lift action
                    </button>
                  )
                ) : null}
                {isRecordActive(action) && action.type === "delete_user" ? (
                  <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">
                    Account deletion cannot be restored from this control.
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
