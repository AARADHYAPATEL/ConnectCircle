import { NextResponse } from "next/server";
import { getMutationBlockedResponse } from "@/lib/apiModeration";
import {
  cancelConnectionRequest,
  respondToConnectionRequest,
} from "@/lib/connectionStore";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

  const responseBody = body as Record<string, unknown>;
  const requestId = responseBody.requestId;
  const action = responseBody.action;

  if (typeof requestId !== "string" || !requestId.trim()) {
    return NextResponse.json(
      { error: "Connection request id is required." },
      { status: 400 },
    );
  }

  if (action !== "accept" && action !== "decline" && action !== "cancel") {
    return NextResponse.json({ error: "Response action is invalid." }, { status: 400 });
  }

  if (action === "cancel") {
    const result = await cancelConnectionRequest(user.username, requestId);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json({ success: true });
  }

  const result = await respondToConnectionRequest(user.username, requestId, action);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  return NextResponse.json({
    request: result.request,
    friendship: result.friendship,
  });
}
