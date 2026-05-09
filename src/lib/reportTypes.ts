import type { ChatMediaAttachmentKind } from "@/lib/chatImageAttachments";

export const reportReasons = [
  "bullying_harassment",
  "self_harm_safety",
  "hate_discrimination",
  "inappropriate_content",
  "spam_fake",
  "other",
] as const;

export type ReportReason = (typeof reportReasons)[number];

export const reportReasonOptions: Array<{
  label: string;
  value: ReportReason;
}> = [
  { label: "Bullying or harassment", value: "bullying_harassment" },
  { label: "Self-harm or safety concern", value: "self_harm_safety" },
  { label: "Hate or discrimination", value: "hate_discrimination" },
  { label: "Inappropriate content", value: "inappropriate_content" },
  { label: "Spam or fake account", value: "spam_fake" },
  { label: "Other", value: "other" },
];

export const reportContextTypes = [
  "profile",
  "dm_message",
  "circle_message",
] as const;

export type ReportContextType = (typeof reportContextTypes)[number];

export const reportStatuses = [
  "open",
  "reviewing",
  "resolved",
  "dismissed",
] as const;

export type ReportStatus = (typeof reportStatuses)[number];

export const reportDetailsLimit = 600;

export type ReportMediaSnapshot = {
  kind: ChatMediaAttachmentKind;
  name: string;
  size: number;
  type: string;
};

export type ReportMessageSnapshot = {
  authorUsername: string;
  circleId?: string;
  circleName?: string;
  createdAt: string;
  editedAt?: string;
  mediaAttachment?: ReportMediaSnapshot;
  message: string;
  messageId: string;
};

export type SafetyReport = {
  id: string;
  reporterUsername: string;
  reportedUsername: string;
  reason: ReportReason;
  details: string;
  contextType: ReportContextType;
  contextId: string;
  messageSnapshot?: ReportMessageSnapshot;
  status: ReportStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  resolutionNote?: string;
};

export function isReportReason(value: unknown): value is ReportReason {
  return (
    typeof value === "string" &&
    reportReasons.some((reason) => reason === value)
  );
}

export function isReportContextType(
  value: unknown,
): value is ReportContextType {
  return (
    typeof value === "string" &&
    reportContextTypes.some((contextType) => contextType === value)
  );
}

export function isReportStatus(value: unknown): value is ReportStatus {
  return (
    typeof value === "string" &&
    reportStatuses.some((status) => status === value)
  );
}

