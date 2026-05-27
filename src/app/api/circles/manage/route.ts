import { NextResponse } from "next/server";
import { getMutationBlockedResponse } from "@/lib/apiModeration";
import { deleteCircle, leaveCircle } from "@/lib/circleStore";
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
  const circleId = requestBody.circleId;
  const action = requestBody.action;

  if (typeof circleId !== "string" || !circleId.trim()) {
    return NextResponse.json({ error: "Circle is required." }, { status: 400 });
  }

  if (action !== "delete" && action !== "leave") {
    return NextResponse.json({ error: "Circle action is invalid." }, { status: 400 });
  }

  const result =
    action === "delete"
      ? await deleteCircle(user.username, circleId)
      : await leaveCircle(user.username, circleId);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ circle: result.circle, success: true });
}
