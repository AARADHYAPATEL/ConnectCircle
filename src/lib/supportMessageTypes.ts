export const supportMessageLimit = 220;

export const supportMessageSuggestions = [
  "I am here if you want to talk.",
  "You are handling more than you may realize.",
  "I am proud of you for getting through today.",
  "I can listen if you need a place to start.",
  "You matter, and I am glad you are here.",
  "Take your time. I am with you.",
] as const;

export type SupportMessage = {
  id: string;
  fromUsername: string;
  toUsername: string;
  message: string;
  createdAt: string;
};

export type SupportMessageSummary = {
  receivedMessages: SupportMessage[];
  sentMessages: SupportMessage[];
};

export function isSupportMessage(value: unknown): value is SupportMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as Partial<SupportMessage>;

  return (
    typeof message.id === "string" &&
    typeof message.fromUsername === "string" &&
    typeof message.toUsername === "string" &&
    typeof message.message === "string" &&
    typeof message.createdAt === "string"
  );
}
