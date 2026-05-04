import { NextResponse } from "next/server";
import {
  deleteChatMessage,
  editChatMessage,
  getChatOverview,
  getChatThread,
  sendChatMessage,
} from "@/lib/chatStore";
import {
  validateOptionalChatImageAttachment,
  type ChatImageAttachment,
} from "@/lib/chatImageAttachments";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const friendUsername = new URL(request.url).searchParams.get("friend");

  if (friendUsername) {
    const result = await getChatThread(user.username, friendUsername);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result.thread);
  }

  const overview = await getChatOverview(user.username);

  return NextResponse.json(overview);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
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

  const chatMessage = body as Record<string, unknown>;
  const toUsername = chatMessage.toUsername;
  const message = chatMessage.message;
  const imageAttachment = validateOptionalChatImageAttachment(
    chatMessage.imageAttachment,
  );

  if (typeof toUsername !== "string" || !toUsername.trim()) {
    return NextResponse.json({ error: "Choose a friend." }, { status: 400 });
  }

  if (typeof message !== "string") {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  if (imageAttachment.error) {
    return NextResponse.json(
      { error: imageAttachment.error },
      { status: 400 },
    );
  }

  const result = await sendChatMessage(
    user.username,
    toUsername,
    message,
    imageAttachment.attachment,
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

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const chatMessage = body as Record<string, unknown>;
  const messageId = chatMessage.id;
  const message = chatMessage.message;
  let nextImageAttachment: ChatImageAttachment | null | undefined;

  if (typeof messageId !== "string" || !messageId.trim()) {
    return NextResponse.json({ error: "Message id is required." }, { status: 400 });
  }

  if (typeof message !== "string") {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  if (Object.prototype.hasOwnProperty.call(chatMessage, "imageAttachment")) {
    const imageAttachment = validateOptionalChatImageAttachment(
      chatMessage.imageAttachment,
    );

    if (imageAttachment.error) {
      return NextResponse.json(
        { error: imageAttachment.error },
        { status: 400 },
      );
    }

    nextImageAttachment = imageAttachment.attachment;
  }

  const result = await editChatMessage(
    user.username,
    messageId,
    message,
    nextImageAttachment,
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

  const result = await deleteChatMessage(user.username, messageId);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ deleted: true });
}
