import { NextResponse } from "next/server";
import { getCircleMoodEntries } from "@/lib/moodEntryStore";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const circleId = new URL(request.url).searchParams.get("circleId");

  if (!circleId) {
    return NextResponse.json({ error: "Circle is required." }, { status: 400 });
  }

  const result = await getCircleMoodEntries(user.username, circleId);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({
    circle: result.circle,
    entries: result.entries,
  });
}
