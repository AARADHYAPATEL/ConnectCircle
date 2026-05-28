import type { SavedFeedback } from "@/lib/feedbackTypes";

type ResendEmailResponse = {
  error?: {
    message?: string;
  };
};

function getImageAttachmentContent(dataUrl: string) {
  return dataUrl.split(",", 2)[1] ?? "";
}

function getSafeImageFilename(filename: string, index: number) {
  const fallbackFilename = `feedback-image-${index + 1}.png`;
  const cleanFilename = filename
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .slice(0, 96);

  return cleanFilename || fallbackFilename;
}

function getFeedbackEmailSummary(feedback: SavedFeedback) {
  return {
    ...feedback,
    imageAttachments: feedback.imageAttachments?.map((imageAttachment) => ({
      name: imageAttachment.name,
      size: imageAttachment.size,
      type: imageAttachment.type,
    })),
  };
}

export async function sendFeedbackEmail(feedback: SavedFeedback) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.FEEDBACK_EMAIL_TO;
  const from = process.env.FEEDBACK_EMAIL_FROM;

  if (!apiKey || !to || !from) {
    return "skipped" as const;
  }

  const attachmentContent = Buffer.from(
    JSON.stringify(getFeedbackEmailSummary(feedback), null, 2),
    "utf8",
  ).toString("base64");
  const imageAttachments =
    feedback.imageAttachments
      ?.filter(
        (imageAttachment): imageAttachment is typeof imageAttachment & {
          dataUrl: string;
        } => typeof imageAttachment.dataUrl === "string",
      )
      .map((imageAttachment, index) => ({
        content: getImageAttachmentContent(imageAttachment.dataUrl),
        filename: `connectcircle-feedback-${feedback.id}-image-${
          index + 1
        }-${getSafeImageFilename(imageAttachment.name, index)}`,
      })) ?? [];

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      attachments: [
        {
          content: attachmentContent,
          filename: `connectcircle-feedback-${feedback.id}.json`,
        },
        ...imageAttachments,
      ],
      from,
      subject: `ConnectCircle feedback: ${feedback.category}`,
      text: [
        `New ConnectCircle feedback from @${feedback.username}.`,
        "",
        `Category: ${feedback.category}`,
        `Severity: ${feedback.severity}`,
        `Page: ${feedback.page ?? "Not specified"}`,
        `Feature: ${feedback.feature ?? "Not specified"}`,
        `Page or feature: ${feedback.affectedPage || "Not specified"}`,
        `Images attached: ${feedback.imageAttachments?.length ?? 0}`,
        `Contact allowed: ${feedback.allowContact ? "Yes" : "No"}`,
        "",
        feedback.message,
        "",
        feedback.imageAttachments?.length
          ? "The full feedback file and submitted images are attached."
          : "The full feedback file is attached as JSON.",
      ].join("\n"),
      to,
    }),
  });

  if (!response.ok) {
    let message = "Feedback email could not be sent.";

    try {
      const data = (await response.json()) as ResendEmailResponse;
      message = data.error?.message ?? message;
    } catch {
      // Keep the generic message when Resend does not return JSON.
    }

    throw new Error(message);
  }

  return "sent" as const;
}
