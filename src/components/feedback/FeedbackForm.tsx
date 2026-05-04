"use client";

import { type ClipboardEvent, type FormEvent, useRef, useState } from "react";
import {
  createImageAttachmentFromFile,
  getClipboardImageFiles,
} from "@/components/chat/ChatImageAttachmentInput";
import {
  feedbackAffectedPageLimit,
  feedbackCategories,
  feedbackFeatures,
  feedbackImageAttachmentMaxBytes,
  feedbackImageAttachmentLimit,
  feedbackImageAttachmentSizeLabel,
  feedbackMessageLimit,
  feedbackPages,
  feedbackSeverities,
  type FeedbackCategory,
  type FeedbackFeature,
  type FeedbackImageAttachment,
  type FeedbackPage,
  type FeedbackSeverity,
} from "@/lib/feedbackTypes";

type FeedbackResponse = {
  emailStatus?: "sent" | "skipped" | "failed";
  error?: string;
};

export function FeedbackForm({ username }: { username: string }) {
  const [category, setCategory] = useState<FeedbackCategory>("Bug");
  const [severity, setSeverity] = useState<FeedbackSeverity>("Medium");
  const [page, setPage] = useState<FeedbackPage>("Home");
  const [feature, setFeature] = useState<FeedbackFeature>("Navigation");
  const [affectedPage, setAffectedPage] = useState("");
  const [message, setMessage] = useState("");
  const [imageAttachments, setImageAttachments] = useState<
    FeedbackImageAttachment[]
  >([]);
  const [allowContact, setAllowContact] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const trimmedMessage = message.trim();
  const canSubmit = trimmedMessage.length > 0 && !isSubmitting;
  const canAttachImages =
    imageAttachments.length < feedbackImageAttachmentLimit && !isSubmitting;

  async function handleImageFiles(files: File[]) {
    if (isSubmitting) {
      return;
    }

    if (files.length === 0) {
      return;
    }

    const remainingSlots =
      feedbackImageAttachmentLimit - imageAttachments.length;

    if (remainingSlots <= 0) {
      setError(`Attach up to ${feedbackImageAttachmentLimit} images.`);
      return;
    }

    setSuccessMessage("");

    try {
      const nextAttachments: FeedbackImageAttachment[] = [];

      for (const file of files.slice(0, remainingSlots)) {
        nextAttachments.push(
          await createImageAttachmentFromFile(file, {
            maxBytes: feedbackImageAttachmentMaxBytes,
            tooLargeMessage: `Feedback images must be ${feedbackImageAttachmentSizeLabel} or smaller.`,
          }),
        );
      }

      setImageAttachments((currentAttachments) => [
        ...currentAttachments,
        ...nextAttachments,
      ].slice(0, feedbackImageAttachmentLimit));
      setError(
        files.length > remainingSlots
          ? `Attached the first ${remainingSlots} image${
              remainingSlots === 1 ? "" : "s"
            }. Feedback can include up to ${feedbackImageAttachmentLimit}.`
          : "",
      );
    } catch (imageError) {
      setError(
        imageError instanceof Error
          ? imageError.message
          : "Image could not be attached.",
      );
    }
  }

  async function handleFormPaste(event: ClipboardEvent<HTMLFormElement>) {
    const imageFiles = getClipboardImageFiles(event.clipboardData);

    if (imageFiles.length === 0) {
      return;
    }

    event.preventDefault();
    await handleImageFiles(imageFiles);
  }

  function removeImageAttachment(indexToRemove: number) {
    setImageAttachments((currentAttachments) =>
      currentAttachments.filter((_, index) => index !== indexToRemove),
    );
    setError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    setIsSubmitting(true);
    setError("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          affectedPage,
          allowContact,
          category,
          feature,
          imageAttachments,
          message,
          page,
          severity,
        }),
      });
      const data = (await response.json()) as FeedbackResponse;

      if (!response.ok) {
        setError(data.error ?? "Feedback could not be submitted.");
        return;
      }

      setAffectedPage("");
      setAllowContact(false);
      setCategory("Bug");
      setFeature("Navigation");
      setImageAttachments([]);
      setMessage("");
      setPage("Home");
      setSeverity("Medium");
      setSuccessMessage(getSuccessMessage(data.emailStatus));
    } catch {
      setError("We could not reach the feedback service.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      className="rounded-md border border-slate-200 bg-white p-5 shadow-sm"
      onPaste={(event) => void handleFormPaste(event)}
      onSubmit={handleSubmit}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-slate-700">
          Feedback type
          <select
            className="mt-2 min-h-12 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-100"
            onChange={(event) =>
              setCategory(event.target.value as FeedbackCategory)
            }
            value={category}
          >
            {feedbackCategories.map((feedbackCategory) => (
              <option key={feedbackCategory}>{feedbackCategory}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-semibold text-slate-700">
          Severity
          <select
            className="mt-2 min-h-12 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-100"
            onChange={(event) =>
              setSeverity(event.target.value as FeedbackSeverity)
            }
            value={severity}
          >
            {feedbackSeverities.map((feedbackSeverity) => (
              <option key={feedbackSeverity}>{feedbackSeverity}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-slate-700">
          Page
          <select
            className="mt-2 min-h-12 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-100"
            onChange={(event) => setPage(event.target.value as FeedbackPage)}
            value={page}
          >
            {feedbackPages.map((feedbackPage) => (
              <option key={feedbackPage}>{feedbackPage}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-semibold text-slate-700">
          Feature
          <select
            className="mt-2 min-h-12 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-100"
            onChange={(event) =>
              setFeature(event.target.value as FeedbackFeature)
            }
            value={feature}
          >
            {feedbackFeatures.map((feedbackFeature) => (
              <option key={feedbackFeature}>{feedbackFeature}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="mt-5 block text-sm font-semibold text-slate-700">
        Specific location
        <input
          className="mt-2 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-900 outline-none focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-100"
          maxLength={feedbackAffectedPageLimit}
          onChange={(event) => setAffectedPage(event.target.value)}
          placeholder="Specific button, section, or screen state..."
          value={affectedPage}
        />
      </label>

      <label className="mt-5 block text-sm font-semibold text-slate-700">
        Describe the issue or suggestion
        <textarea
          className="mt-2 min-h-40 w-full resize-none rounded-md border border-slate-300 bg-slate-50 p-3 text-sm leading-6 text-slate-900 outline-none focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-100"
          maxLength={feedbackMessageLimit}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Describe what happened, what you expected, and any detail that would help reproduce or understand it."
          value={message}
        />
      </label>
      <p className="mt-1 text-right text-xs font-semibold text-slate-500">
        {message.length}/{feedbackMessageLimit}
      </p>

      <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
        <input
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          disabled={!canAttachImages}
          multiple
          onChange={(event) => {
            void handleImageFiles(Array.from(event.currentTarget.files ?? []));
            event.currentTarget.value = "";
          }}
          ref={imageInputRef}
          type="file"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-slate-900">Images</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {imageAttachments.length}/{feedbackImageAttachmentLimit} images,
              {` ${feedbackImageAttachmentSizeLabel}`} each
            </p>
          </div>
          <button
            className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-bold text-teal-800 transition hover:border-teal-300 hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!canAttachImages}
            onClick={() => imageInputRef.current?.click()}
            type="button"
          >
            Attach images
          </button>
        </div>

        {imageAttachments.length > 0 ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {imageAttachments.map((imageAttachment, index) => (
              <div
                className="flex items-center gap-3 rounded-md border border-teal-200 bg-white p-2"
                key={`${imageAttachment.name}-${index}`}
              >
                <div
                  aria-label={imageAttachment.name}
                  className="h-14 w-16 shrink-0 rounded-md border border-teal-100 bg-teal-50 bg-contain bg-center bg-no-repeat"
                  role="img"
                  style={{
                    backgroundImage: `url(${JSON.stringify(
                      imageAttachment.dataUrl,
                    )})`,
                  }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900">
                    {imageAttachment.name}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {formatBytes(imageAttachment.size)}
                  </p>
                </div>
                <button
                  className="btn btn-danger btn-sm shrink-0"
                  disabled={isSubmitting}
                  onClick={() => removeImageAttachment(index)}
                  type="button"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <label className="mt-4 flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">
        <input
          checked={allowContact}
          className="mt-1 accent-teal-700"
          onChange={(event) => setAllowContact(event.target.checked)}
          type="checkbox"
        />
        <span>
          The developer may contact @{username} about this feedback. If checked,
          the feedback file includes the account email for follow-up.
        </span>
      </label>

      {error ? (
        <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-900">
          {error}
        </p>
      ) : null}

      {successMessage ? (
        <p className="mt-4 rounded-md border border-teal-200 bg-teal-50 p-3 text-sm font-semibold text-teal-900">
          {successMessage}
        </p>
      ) : null}

      <button
        className="btn btn-primary mt-5 w-full"
        disabled={!canSubmit}
        type="submit"
      >
        {isSubmitting ? "Submitting..." : "Submit feedback"}
      </button>
    </form>
  );
}

function formatBytes(value: number) {
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(value / 1024))} KB`;
}

function getSuccessMessage(emailStatus: FeedbackResponse["emailStatus"]) {
  switch (emailStatus) {
    case "sent":
      return "Thank you. Your feedback was saved and emailed to the developer.";
    case "failed":
      return "Thank you. Your feedback was saved, but email delivery needs attention.";
    default:
      return "Thank you. Your feedback was saved for review.";
  }
}
