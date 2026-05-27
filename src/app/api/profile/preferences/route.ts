import { NextResponse } from "next/server";
import { updateUserPreferences } from "@/lib/authStore";
import { getMutationBlockedResponse } from "@/lib/apiModeration";
import {
  availabilityStatusOptions,
  themePreferenceOptions,
  type AvailabilityStatus,
  type ThemePreference,
} from "@/lib/profileTypes";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

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

  const preferences = body as Record<string, unknown>;
  const availabilityStatus = isAvailabilityStatus(preferences.availabilityStatus)
    ? preferences.availabilityStatus
    : "open";
  const themePreference = isThemePreference(preferences.themePreference)
    ? preferences.themePreference
    : "system";
  const result = await updateUserPreferences(user.id, {
    availabilityStatus,
    themePreference,
  });

  if (result.error || !result.user) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ user: result.user });
}

function isAvailabilityStatus(value: unknown): value is AvailabilityStatus {
  return (
    typeof value === "string" &&
    availabilityStatusOptions.some((option) => option === value)
  );
}

function isThemePreference(value: unknown): value is ThemePreference {
  return (
    typeof value === "string" &&
    themePreferenceOptions.some((option) => option === value)
  );
}
