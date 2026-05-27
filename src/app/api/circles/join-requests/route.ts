import { NextResponse } from "next/server";
import {
  respondToCircleJoinRequest,
  sendCircleJoinRequest,
  sendCircleJoinRequestByName,
} from "@/lib/circleStore";
import { getMutationBlockedResponse } from "@/lib/apiModeration";
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

  const requestBody = body as Record<string, unknown>;
  const action = requestBody.action;

  if (action === "request") {
    const circleId = requestBody.circleId;
    const circleName = requestBody.circleName;

    if (typeof circleId === "string" && circleId.trim()) {
      const result = await sendCircleJoinRequest(user.username, circleId);

      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 409 });
      }

      return NextResponse.json(
        { circle: result.circle, request: result.request },
        { status: 201 },
      );
    }

    if (typeof circleName !== "string" || !circleName.trim()) {
      return NextResponse.json({ error: "Circle name is required." }, { status: 400 });
    }

    const result = await sendCircleJoinRequestByName(user.username, circleName);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json(
      { circle: result.circle, request: result.request },
      { status: 201 },
    );
  }

  if (action !== "accept" && action !== "decline") {
    return NextResponse.json({ error: "Join request action is invalid." }, { status: 400 });
  }

  const requestId = requestBody.requestId;

  if (typeof requestId !== "string" || !requestId.trim()) {
    return NextResponse.json(
      { error: "Circle join request id is required." },
      { status: 400 },
    );
  }

  const result = await respondToCircleJoinRequest(
    user.username,
    requestId,
    action,
  );

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  return NextResponse.json({
    circle: result.circle,
    request: result.request,
  });
}
