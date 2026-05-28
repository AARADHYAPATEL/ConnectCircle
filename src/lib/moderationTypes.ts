export const moderationActionTypes = [
  "restrict_user",
  "ban_user",
  "delete_user",
  "ban_ip",
] as const;

export type ModerationActionType = (typeof moderationActionTypes)[number];

export type ModerationRecord = {
  active: boolean;
  createdAt: string;
  createdBy: string;
  deactivatedAt?: string;
  deactivatedBy?: string;
  deactivationReason?: string;
  expiresAt?: string;
  id: string;
  note?: string;
  reason: string;
  reportId?: string;
  targetIp?: string;
  targetUserId?: string;
  targetUsername?: string;
  type: ModerationActionType;
};

export function isModerationActionType(
  value: unknown,
): value is ModerationActionType {
  return (
    typeof value === "string" &&
    moderationActionTypes.some((actionType) => actionType === value)
  );
}

export function getModerationActionLabel(type: ModerationActionType) {
  switch (type) {
    case "restrict_user":
      return "Restrict user";
    case "ban_user":
      return "Ban user";
    case "delete_user":
      return "Delete user";
    case "ban_ip":
      return "Ban IP";
  }
}
