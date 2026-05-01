export const presenceHeartbeatIntervalMs = 25_000;
export const onlinePresenceWindowMs = 90_000;

export type UserPresence = {
  username: string;
  lastSeenAt: string;
};

export function isUserPresence(value: unknown): value is UserPresence {
  if (!value || typeof value !== "object") {
    return false;
  }

  const presence = value as Partial<UserPresence>;

  return (
    typeof presence.username === "string" &&
    typeof presence.lastSeenAt === "string"
  );
}
