import { NextResponse } from "next/server";
import { searchUsersByUsername } from "@/lib/authStore";
import { getConnectionRelationship } from "@/lib/connectionStore";
import type { ConnectionRelationship } from "@/lib/connectionTypes";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type PeopleSearchResult = {
  avatarImage: string;
  displayName: string;
  id: string;
  profileDetailsVisible: boolean;
  username: string;
  relationship: ConnectionRelationship;
};

function canViewProfileDetails(
  profileVisibility: "friends" | "private" | "public",
  relationship: ConnectionRelationship,
) {
  if (relationship === "blocked") {
    return false;
  }

  if (profileVisibility === "public") {
    return true;
  }

  if (profileVisibility === "friends") {
    return relationship === "connected";
  }

  return false;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const users = await searchUsersByUsername(query, {
    excludeUsername: user.username,
    limit: 10,
  });
  const results: PeopleSearchResult[] = await Promise.all(
    users.map(async (searchResult) => {
      const relationshipSummary = await getConnectionRelationship(
        user.username,
        searchResult.username,
      );
      const relationship = relationshipSummary.relationship;
      const profileDetailsVisible = canViewProfileDetails(
        searchResult.profileVisibility,
        relationship,
      );

      return {
        avatarImage: profileDetailsVisible ? searchResult.avatarImage : "",
        displayName: profileDetailsVisible ? searchResult.displayName : "",
        id: searchResult.id,
        profileDetailsVisible,
        username: searchResult.username,
        relationship,
      };
    }),
  );

  return NextResponse.json({ results });
}
