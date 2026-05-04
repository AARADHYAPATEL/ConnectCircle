import {
  isChatImageAttachment,
  type ChatImageAttachment,
} from "@/lib/chatImageAttachments";

export const chatMessageLimit = 500;

export type ChatMessage = {
  id: string;
  fromUsername: string;
  toUsername: string;
  message: string;
  imageAttachment?: ChatImageAttachment;
  createdAt: string;
  editedAt?: string;
};

export type ChatConversationPreview = {
  friendUsername: string;
  lastMessage: ChatMessage | null;
};

export type ChatOverview = {
  friends: string[];
  conversations: ChatConversationPreview[];
};

export type ChatThread = {
  friendUsername: string;
  messages: ChatMessage[];
};

export function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as Partial<ChatMessage>;

  return (
    typeof message.id === "string" &&
    typeof message.fromUsername === "string" &&
    typeof message.toUsername === "string" &&
    typeof message.message === "string" &&
    (message.imageAttachment === undefined ||
      isChatImageAttachment(message.imageAttachment)) &&
    typeof message.createdAt === "string" &&
    (message.editedAt === undefined || typeof message.editedAt === "string")
  );
}
