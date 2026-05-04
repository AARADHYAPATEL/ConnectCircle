import {
  isChatImageAttachment,
  type ChatImageAttachment,
} from "@/lib/chatImageAttachments";

export const circleNameLimit = 40;
export const circleDescriptionLimit = 120;
export const circleMessageLimit = 500;

export type Circle = {
  id: string;
  name: string;
  ownerUsername: string;
  memberUsernames: string[];
  description: string;
  createdAt: string;
};

export type CircleJoinRequestStatus = "pending" | "accepted" | "declined";

export type CircleJoinRequest = {
  id: string;
  circleId: string;
  fromUsername: string;
  toUsername: string;
  status: CircleJoinRequestStatus;
  createdAt: string;
  respondedAt?: string;
};

export type CircleJoinRequestWithCircle = CircleJoinRequest & {
  circle: Circle;
};

export type CircleSummary = {
  circles: Circle[];
  discoverableCircles: Circle[];
  incomingJoinRequests: CircleJoinRequestWithCircle[];
  outgoingJoinRequests: CircleJoinRequestWithCircle[];
};

export type CircleMessage = {
  id: string;
  circleId: string;
  fromUsername: string;
  message: string;
  imageAttachment?: ChatImageAttachment;
  createdAt: string;
  editedAt?: string;
};

export type CircleChatThread = {
  circle: Circle;
  messages: CircleMessage[];
};

export function isCircle(value: unknown): value is Circle {
  if (!value || typeof value !== "object") {
    return false;
  }

  const circle = value as Partial<Circle>;

  return (
    typeof circle.id === "string" &&
    typeof circle.name === "string" &&
    typeof circle.ownerUsername === "string" &&
    Array.isArray(circle.memberUsernames) &&
    circle.memberUsernames.every((username) => typeof username === "string") &&
    typeof circle.description === "string" &&
    typeof circle.createdAt === "string"
  );
}

export function isCircleJoinRequest(
  value: unknown,
): value is CircleJoinRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const request = value as Partial<CircleJoinRequest>;

  return (
    typeof request.id === "string" &&
    typeof request.circleId === "string" &&
    typeof request.fromUsername === "string" &&
    typeof request.toUsername === "string" &&
    (request.status === "pending" ||
      request.status === "accepted" ||
      request.status === "declined") &&
    typeof request.createdAt === "string" &&
    (request.respondedAt === undefined ||
      typeof request.respondedAt === "string")
  );
}

export function isCircleMessage(value: unknown): value is CircleMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as Partial<CircleMessage>;

  return (
    typeof message.id === "string" &&
    typeof message.circleId === "string" &&
    typeof message.fromUsername === "string" &&
    typeof message.message === "string" &&
    (message.imageAttachment === undefined ||
      isChatImageAttachment(message.imageAttachment)) &&
    typeof message.createdAt === "string" &&
    (message.editedAt === undefined || typeof message.editedAt === "string")
  );
}
