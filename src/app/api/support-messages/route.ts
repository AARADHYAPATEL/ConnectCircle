import { NextResponse } from "next/server";
import {
  getSupportMessageSummary,
  sendSupportMessage,
} from "@/lib/supportMessageStore";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const summary = await getSupportMessageSummary(user.username);

  return NextResponse.json(summary);
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

  const supportMessage = body as Record<string, unknown>;
  const toUsername = supportMessage.toUsername;
  const message = supportMessage.message;

  if (typeof toUsername !== "string" || !toUsername.trim()) {
    return NextResponse.json({ error: "Choose a friend." }, { status: 400 });
  }

  if (typeof message !== "string") {
    return NextResponse.json(
      { error: "Support message is required." },
      { status: 400 },
    );
  }

  const result = await sendSupportMessage(user.username, toUsername, message);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ message: result.message }, { status: 201 });
}
