import { NextResponse } from "next/server";
import { getUserByUsername } from "@/lib/authStore";
import { getMutationBlockedResponse } from "@/lib/apiModeration";
import { sendConnectionRequest } from "@/lib/connectionStore";
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

  const targetUsername = (body as Record<string, unknown>).username;

  if (typeof targetUsername !== "string" || !targetUsername.trim()) {
    return NextResponse.json({ error: "Username is required." }, { status: 400 });
  }

  const targetUser = await getUserByUsername(targetUsername);

  if (!targetUser) {
    return NextResponse.json(
      { error: "No ConnectCircle account was found with that username." },
      { status: 404 },
    );
  }

  const result = await sendConnectionRequest(user.username, targetUser.username);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  return NextResponse.json({ request: result.request }, { status: 201 });
}
