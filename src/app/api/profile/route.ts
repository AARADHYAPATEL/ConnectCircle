import { NextResponse } from "next/server";
import { updateUserProfile } from "@/lib/authStore";
import {
  profileVisibilityOptions,
  type ProfileVisibility,
} from "@/lib/profileTypes";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
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

  const profile = body as Record<string, unknown>;
  const displayName =
    typeof profile.displayName === "string" ? profile.displayName : "";
  const bio = typeof profile.bio === "string" ? profile.bio : "";
  const avatarImage =
    typeof profile.avatarImage === "string" ? profile.avatarImage : "";
  const profileVisibility = isProfileVisibility(profile.profileVisibility)
    ? profile.profileVisibility
    : "friends";
  const result = await updateUserProfile(user.id, {
    avatarImage,
    bio,
    displayName,
    profileVisibility,
  });

  if (result.error || !result.user) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ user: result.user });
}

function isProfileVisibility(value: unknown): value is ProfileVisibility {
  return (
    typeof value === "string" &&
    profileVisibilityOptions.some((option) => option === value)
  );
}
