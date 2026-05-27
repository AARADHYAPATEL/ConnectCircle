import { NextResponse } from "next/server";
import { getMutationBlockedResponse } from "@/lib/apiModeration";
import { createCircle, getCircleSummaryForUser } from "@/lib/circleStore";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const circles = await getCircleSummaryForUser(user.username);

  return NextResponse.json(circles);
}

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

  const circle = body as Record<string, unknown>;
  const name = circle.name;
  const description = circle.description;
  const memberUsernames = circle.memberUsernames;

  if (typeof name !== "string") {
    return NextResponse.json({ error: "Circle name is required." }, { status: 400 });
  }

  if (typeof description !== "string") {
    return NextResponse.json({ error: "Description is invalid." }, { status: 400 });
  }

  if (!Array.isArray(memberUsernames)) {
    return NextResponse.json({ error: "Choose at least one friend." }, { status: 400 });
  }

  const result = await createCircle(user.username, {
    description,
    memberUsernames: memberUsernames.filter(
      (memberUsername): memberUsername is string =>
        typeof memberUsername === "string",
    ),
    name,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ circle: result.circle }, { status: 201 });
}
