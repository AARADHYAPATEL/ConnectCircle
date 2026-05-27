import { NextResponse } from "next/server";
import {
  addMoodEntry,
  deleteMoodEntry,
  getMoodEntries,
  updateMoodEntry,
} from "@/lib/moodEntryStore";
import { getCircleRecipientsForUser } from "@/lib/circleStore";
import { getFriendUsernames } from "@/lib/connectionStore";
import {
  type Audience,
  isAudience,
  isSupportNeed,
  moodLimit,
  noteLimit,
  personalAudience,
} from "@/lib/moodTypes";
import { getMutationBlockedResponse } from "@/lib/apiModeration";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const entries = await getMoodEntries(user.username);

  return NextResponse.json({ entries });
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

  const body: unknown = await request.json();

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid entry." }, { status: 400 });
  }

  const entry = body as Record<string, unknown>;
  const mood = typeof entry.mood === "string" ? entry.mood.trim() : "";
  const note = typeof entry.note === "string" ? entry.note.trim() : "";

  if (!mood || mood.length > moodLimit) {
    return NextResponse.json({ error: "Mood is required." }, { status: 400 });
  }

  if (
    typeof entry.intensity !== "number" ||
    entry.intensity < 1 ||
    entry.intensity > 5
  ) {
    return NextResponse.json({ error: "Intensity is invalid." }, { status: 400 });
  }

  if (!isAudience(entry.audience)) {
    return NextResponse.json({ error: "Audience is invalid." }, { status: 400 });
  }

  if (!isSupportNeed(entry.supportNeed)) {
    return NextResponse.json(
      { error: "Support preference is invalid." },
      { status: 400 },
    );
  }

  if (note.length > noteLimit) {
    return NextResponse.json({ error: "Note is too long." }, { status: 400 });
  }

  const sharedWithResult = await resolveSharedWith(
    user.username,
    entry.audience,
    entry.sharedWith,
    entry.sharedCircleIds,
  );

  if (sharedWithResult.error) {
    return NextResponse.json({ error: sharedWithResult.error }, { status: 400 });
  }

  const savedEntry = await addMoodEntry(user.username, {
    mood,
    intensity: entry.intensity,
    audience: entry.audience,
    supportNeed: entry.supportNeed,
    note,
    sharedCircleIds: sharedWithResult.sharedCircleIds,
    sharedWith: sharedWithResult.sharedWith,
  });

  return NextResponse.json({ entry: savedEntry }, { status: 201 });
}

export async function PATCH(request: Request) {
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

  const entry = body as Record<string, unknown>;
  const entryId = entry.id;
  const mood = typeof entry.mood === "string" ? entry.mood.trim() : "";
  const note = typeof entry.note === "string" ? entry.note.trim() : "";

  if (typeof entryId !== "string" || !entryId.trim()) {
    return NextResponse.json({ error: "Entry id is required." }, { status: 400 });
  }

  if (!mood || mood.length > moodLimit) {
    return NextResponse.json({ error: "Mood is required." }, { status: 400 });
  }

  if (
    typeof entry.intensity !== "number" ||
    entry.intensity < 1 ||
    entry.intensity > 5
  ) {
    return NextResponse.json({ error: "Intensity is invalid." }, { status: 400 });
  }

  if (!isAudience(entry.audience)) {
    return NextResponse.json({ error: "Audience is invalid." }, { status: 400 });
  }

  if (!isSupportNeed(entry.supportNeed)) {
    return NextResponse.json(
      { error: "Support preference is invalid." },
      { status: 400 },
    );
  }

  if (note.length > noteLimit) {
    return NextResponse.json({ error: "Note is too long." }, { status: 400 });
  }

  const sharedWithResult = await resolveSharedWith(
    user.username,
    entry.audience,
    entry.sharedWith,
    entry.sharedCircleIds,
  );

  if (sharedWithResult.error) {
    return NextResponse.json({ error: sharedWithResult.error }, { status: 400 });
  }

  const updatedEntry = await updateMoodEntry(user.username, entryId, {
    mood,
    intensity: entry.intensity,
    audience: entry.audience,
    supportNeed: entry.supportNeed,
    note,
    sharedCircleIds: sharedWithResult.sharedCircleIds,
    sharedWith: sharedWithResult.sharedWith,
  });

  if (!updatedEntry) {
    return NextResponse.json({ error: "Entry was not found." }, { status: 404 });
  }

  return NextResponse.json({ entry: updatedEntry });
}

export async function DELETE(request: Request) {
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

  const entryId = (body as Record<string, unknown>).id;

  if (typeof entryId !== "string" || !entryId.trim()) {
    return NextResponse.json({ error: "Entry id is required." }, { status: 400 });
  }

  const wasDeleted = await deleteMoodEntry(user.username, entryId);

  if (!wasDeleted) {
    return NextResponse.json({ error: "Entry was not found." }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}

async function resolveSharedWith(
  username: string,
  audience: Audience,
  requestedSharedWith: unknown,
  requestedCircleIds: unknown,
) {
  if (audience === personalAudience) {
    return { error: "", sharedCircleIds: [], sharedWith: [] };
  }

  if (audience === "Selected circles") {
    const circleResult = await getCircleRecipientsForUser(
      username,
      requestedCircleIds,
    );

    return {
      error: circleResult.error,
      sharedCircleIds: circleResult.circleIds,
      sharedWith: circleResult.recipients,
    };
  }

  const friendUsernames = await getFriendUsernames(username);

  if (friendUsernames.length === 0) {
    return {
      error: "Add friends before sharing a mood check-in.",
      sharedCircleIds: [],
      sharedWith: [],
    };
  }

  if (audience === "Circle feed") {
    return { error: "", sharedCircleIds: [], sharedWith: friendUsernames };
  }

  if (!Array.isArray(requestedSharedWith)) {
    return {
      error: "Choose at least one friend to share with.",
      sharedCircleIds: [],
      sharedWith: [],
    };
  }

  const friendsByUsername = new Map(
    friendUsernames.map((friendUsername) => [
      friendUsername.toLowerCase(),
      friendUsername,
    ]),
  );
  const selectedFriendUsernames = Array.from(
    new Set(
      requestedSharedWith
        .filter((friendUsername): friendUsername is string =>
          typeof friendUsername === "string",
        )
        .map((friendUsername) => friendUsername.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
  const invalidFriendUsername = selectedFriendUsernames.find(
    (friendUsername) => !friendsByUsername.has(friendUsername),
  );

  if (invalidFriendUsername) {
    return {
      error: "You can only share mood check-ins with accepted friends.",
      sharedCircleIds: [],
      sharedWith: [],
    };
  }

  const sharedWith = selectedFriendUsernames
    .map((friendUsername) => friendsByUsername.get(friendUsername))
    .filter((friendUsername): friendUsername is string => Boolean(friendUsername));

  if (sharedWith.length === 0) {
    return {
      error: "Choose at least one friend to share with.",
      sharedCircleIds: [],
      sharedWith: [],
    };
  }

  return { error: "", sharedCircleIds: [], sharedWith };
}
