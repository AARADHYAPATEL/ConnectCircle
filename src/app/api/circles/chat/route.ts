import { NextResponse } from "next/server";
import {
  deleteCircleMessage,
  editCircleMessage,
  getCircleChatThread,
  sendCircleMessage,
} from "@/lib/circleStore";
import {
  validateOptionalChatMediaAttachment,
  type ChatMediaAttachment,
} from "@/lib/chatImageAttachments";
import { getMutationBlockedResponse } from "@/lib/apiModeration";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const circleId = new URL(request.url).searchParams.get("circleId");

  if (!circleId) {
    return NextResponse.json({ error: "Circle is required." }, { status: 400 });
  }

  const result = await getCircleChatThread(user.username, circleId);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json(result.thread);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const moderationResponse = await getMutationBlockedResponse(user.username);

  if (moderationResponse) {
    return moderationResponse;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const circleMessage = body as Record<string, unknown>;
  const circleId = circleMessage.circleId;
  const message = circleMessage.message;
  const mediaAttachment = validateOptionalChatMediaAttachment(
    circleMessage.imageAttachment,
  );

  if (typeof circleId !== "string" || !circleId.trim()) {
    return NextResponse.json({ error: "Circle is required." }, { status: 400 });
  }

  if (typeof message !== "string") {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  if (mediaAttachment.error) {
    return NextResponse.json(
      { error: mediaAttachment.error },
      { status: 400 },
    );
  }

  const result = await sendCircleMessage(
    user.username,
    circleId,
    message,
    mediaAttachment.attachment,
  );

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ message: result.message }, { status: 201 });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const moderationResponse = await getMutationBlockedResponse(user.username);

  if (moderationResponse) {
    return moderationResponse;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const circleMessage = body as Record<string, unknown>;
  const messageId = circleMessage.id;
  const message = circleMessage.message;
  let nextMediaAttachment: ChatMediaAttachment | null | undefined;

  if (typeof messageId !== "string" || !messageId.trim()) {
    return NextResponse.json({ error: "Message id is required." }, { status: 400 });
  }

  if (typeof message !== "string") {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  if (Object.prototype.hasOwnProperty.call(circleMessage, "imageAttachment")) {
    const mediaAttachment = validateOptionalChatMediaAttachment(
      circleMessage.imageAttachment,
    );

    if (mediaAttachment.error) {
      return NextResponse.json(
        { error: mediaAttachment.error },
        { status: 400 },
      );
    }

    nextMediaAttachment = mediaAttachment.attachment;
  }

  const result = await editCircleMessage(
    user.username,
    messageId,
    message,
    nextMediaAttachment,
  );

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ message: result.message });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const moderationResponse = await getMutationBlockedResponse(user.username);

  if (moderationResponse) {
    return moderationResponse;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const messageId = (body as Record<string, unknown>).id;

  if (typeof messageId !== "string" || !messageId.trim()) {
    return NextResponse.json({ error: "Message id is required." }, { status: 400 });
  }

  const result = await deleteCircleMessage(user.username, messageId);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ deleted: true });
}
