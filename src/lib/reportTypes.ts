import type { ChatMediaAttachmentKind } from "@/lib/chatImageAttachments";
import {
  availabilityStatusOptions,
  profileVisibilityOptions,
  themePreferenceOptions,
  type AvailabilityStatus,
  type ProfileVisibility,
  type ThemePreference,
} from "@/lib/profileTypes";

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

export type ReportedUserSnapshot = {
  accountCreatedAt: string;
  availabilityStatus: AvailabilityStatus;
  avatarImagePresent: boolean;
  bio: string;
  displayName: string;
  email: string;
  lastIp?: string;
  lastSeenAt?: string;
  lastUserAgent?: string;
  profileVisibility: ProfileVisibility;
  themePreference: ThemePreference;
  userId: string;
  username: string;
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
  reportedUserSnapshot?: ReportedUserSnapshot;
  reporterIp?: string;
  reporterUserAgent?: string;
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

export function isReportedUserSnapshot(
  value: unknown,
): value is ReportedUserSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const snapshot = value as Partial<ReportedUserSnapshot>;

  return (
    typeof snapshot.userId === "string" &&
    typeof snapshot.username === "string" &&
    typeof snapshot.email === "string" &&
    typeof snapshot.displayName === "string" &&
    typeof snapshot.bio === "string" &&
    typeof snapshot.avatarImagePresent === "boolean" &&
    typeof snapshot.accountCreatedAt === "string" &&
    typeof snapshot.profileVisibility === "string" &&
    profileVisibilityOptions.some(
      (option) => option === snapshot.profileVisibility,
    ) &&
    typeof snapshot.availabilityStatus === "string" &&
    availabilityStatusOptions.some(
      (option) => option === snapshot.availabilityStatus,
    ) &&
    typeof snapshot.themePreference === "string" &&
    themePreferenceOptions.some(
      (option) => option === snapshot.themePreference,
    ) &&
    (typeof snapshot.lastIp === "undefined" ||
      typeof snapshot.lastIp === "string") &&
    (typeof snapshot.lastSeenAt === "undefined" ||
      typeof snapshot.lastSeenAt === "string") &&
    (typeof snapshot.lastUserAgent === "undefined" ||
      typeof snapshot.lastUserAgent === "string")
  );
}
