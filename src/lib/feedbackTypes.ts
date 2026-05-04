import {
  validateImageAttachment,
  type ChatImageAttachment,
} from "@/lib/chatImageAttachments";

export const feedbackCategories = [
  "Bug",
  "Confusing experience",
  "Feature idea",
  "General feedback",
] as const;

export const feedbackSeverities = ["Low", "Medium", "High"] as const;

export const feedbackPages = [
  "Home",
  "Mood check-in",
  "Reflect",
  "Mood history",
  "Mood trends",
  "Friends",
  "Friend chat",
  "Support messages",
  "Groups",
  "Group room",
  "Feedback",
  "Login or account",
  "Mobile layout",
  "Not sure",
] as const;

export const feedbackFeatures = [
  "Navigation",
  "Visual design",
  "Copy or wording",
  "Loading or performance",
  "Google sign-in",
  "Email/password sign-in",
  "Quick check-in",
  "Full check-in",
  "Mood trend graph",
  "Mood history",
  "Friend request",
  "Friend management",
  "Chat messages",
  "Group creation",
  "Join or leave group",
  "Feedback form",
  "Something else",
] as const;

export type FeedbackCategory = (typeof feedbackCategories)[number];
export type FeedbackSeverity = (typeof feedbackSeverities)[number];
export type FeedbackPage = (typeof feedbackPages)[number];
export type FeedbackFeature = (typeof feedbackFeatures)[number];
export type FeedbackImageAttachment = ChatImageAttachment;

export type SavedFeedback = {
  id: string;
  username: string;
  email?: string;
  category: FeedbackCategory;
  severity: FeedbackSeverity;
  page?: FeedbackPage;
  feature?: FeedbackFeature;
  affectedPage: string;
  message: string;
  imageAttachments?: FeedbackImageAttachment[];
  allowContact: boolean;
  createdAt: string;
  emailStatus: "sent" | "skipped" | "failed";
};

export const feedbackMessageLimit = 1500;
export const feedbackAffectedPageLimit = 120;
export const feedbackImageAttachmentLimit = 5;
export const feedbackImageAttachmentMaxBytes = 5 * 1024 * 1024;
export const feedbackImageAttachmentSizeLabel = "5 MB";

export function isFeedbackCategory(value: unknown): value is FeedbackCategory {
  return feedbackCategories.some((category) => category === value);
}

export function isFeedbackSeverity(value: unknown): value is FeedbackSeverity {
  return feedbackSeverities.some((severity) => severity === value);
}

export function isFeedbackPage(value: unknown): value is FeedbackPage {
  return feedbackPages.some((page) => page === value);
}

export function isFeedbackFeature(value: unknown): value is FeedbackFeature {
  return feedbackFeatures.some((feature) => feature === value);
}

export function validateFeedbackImageAttachments(value: unknown): {
  attachments: FeedbackImageAttachment[];
  error: string;
} {
  if (value === undefined || value === null) {
    return {
      attachments: [],
      error: "",
    };
  }

  if (!Array.isArray(value)) {
    return {
      attachments: [],
      error: "Feedback images are invalid.",
    };
  }

  if (value.length > feedbackImageAttachmentLimit) {
    return {
      attachments: [],
      error: `Attach up to ${feedbackImageAttachmentLimit} images.`,
    };
  }

  const attachments: FeedbackImageAttachment[] = [];

  for (const imageAttachment of value) {
    const validation = validateImageAttachment(imageAttachment, {
      maxBytes: feedbackImageAttachmentMaxBytes,
      tooLargeMessage: `Feedback images must be ${feedbackImageAttachmentSizeLabel} or smaller.`,
    });

    if (validation.error || !validation.attachment) {
      return {
        attachments: [],
        error: validation.error || "Feedback images are invalid.",
      };
    }

    attachments.push(validation.attachment);
  }

  return {
    attachments,
    error: "",
  };
}

export function isSavedFeedback(value: unknown): value is SavedFeedback {
  if (!value || typeof value !== "object") {
    return false;
  }

  const feedback = value as Partial<SavedFeedback>;

  return (
    typeof feedback.id === "string" &&
    typeof feedback.username === "string" &&
    (feedback.email === undefined || typeof feedback.email === "string") &&
    isFeedbackCategory(feedback.category) &&
    isFeedbackSeverity(feedback.severity) &&
    (feedback.page === undefined || isFeedbackPage(feedback.page)) &&
    (feedback.feature === undefined || isFeedbackFeature(feedback.feature)) &&
    typeof feedback.affectedPage === "string" &&
    typeof feedback.message === "string" &&
    (feedback.imageAttachments === undefined ||
      (Array.isArray(feedback.imageAttachments) &&
        !validateFeedbackImageAttachments(feedback.imageAttachments).error)) &&
    typeof feedback.allowContact === "boolean" &&
    typeof feedback.createdAt === "string" &&
    (feedback.emailStatus === "sent" ||
      feedback.emailStatus === "skipped" ||
      feedback.emailStatus === "failed")
  );
}
