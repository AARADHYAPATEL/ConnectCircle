import { NextResponse } from "next/server";
import { getSharedMoodEntries } from "@/lib/moodEntryStore";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const entries = await getSharedMoodEntries(user.username);

  return NextResponse.json({ entries });
}
