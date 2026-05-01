import { NextResponse } from "next/server";
import {
  blockFriend,
  removeFriend,
  unblockUser,
} from "@/lib/connectionStore";
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

  const requestBody = body as Record<string, unknown>;
  const targetUsername = requestBody.username;
  const action = requestBody.action;

  if (typeof targetUsername !== "string" || !targetUsername.trim()) {
    return NextResponse.json({ error: "Username is required." }, { status: 400 });
  }

  if (action !== "remove" && action !== "block" && action !== "unblock") {
    return NextResponse.json({ error: "Connection action is invalid." }, { status: 400 });
  }

  const result =
    action === "remove"
      ? await removeFriend(user.username, targetUsername)
      : action === "block"
        ? await blockFriend(user.username, targetUsername)
        : await unblockUser(user.username, targetUsername);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
