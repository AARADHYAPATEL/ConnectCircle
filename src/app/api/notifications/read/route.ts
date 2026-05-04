import { NextResponse } from "next/server";
import { markNotificationsRead } from "@/lib/notificationStore";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const lastSeenAt = await markNotificationsRead(user.username);

  return NextResponse.json({ lastSeenAt });
}
