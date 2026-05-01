import { NextResponse } from "next/server";
import { respondToConnectionRequest } from "@/lib/connectionStore";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

  const responseBody = body as Record<string, unknown>;
  const requestId = responseBody.requestId;
  const action = responseBody.action;

  if (typeof requestId !== "string" || !requestId.trim()) {
    return NextResponse.json(
      { error: "Connection request id is required." },
      { status: 400 },
    );
  }

  if (action !== "accept" && action !== "decline") {
    return NextResponse.json({ error: "Response action is invalid." }, { status: 400 });
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
