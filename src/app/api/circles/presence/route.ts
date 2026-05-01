import { NextResponse } from "next/server";
import { getCircleByIdForUser } from "@/lib/circleStore";
import { getOnlineUsernames, touchPresence } from "@/lib/presenceStore";
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

  const circle = await getCircleByIdForUser(user.username, circleId);

  if (!circle) {
    return NextResponse.json({ error: "Circle was not found." }, { status: 404 });
  }

  const onlineUsernames = await getOnlineUsernames(circle.memberUsernames);

  return NextResponse.json({ onlineUsernames });
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

  const circleId = (body as Record<string, unknown>).circleId;

  if (typeof circleId !== "string" || !circleId.trim()) {
    return NextResponse.json({ error: "Circle is required." }, { status: 400 });
  }

  const circle = await getCircleByIdForUser(user.username, circleId);

  if (!circle) {
    return NextResponse.json({ error: "Circle was not found." }, { status: 404 });
  }

  const presence = await touchPresence(user.username);

  return NextResponse.json({ presence });
}
