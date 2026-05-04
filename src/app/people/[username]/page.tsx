import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { getUserByUsername } from "@/lib/authStore";
import { getConnectionRelationship } from "@/lib/connectionStore";
import type { ConnectionRelationship, Friendship } from "@/lib/connectionTypes";
import type { AvailabilityStatus, ProfileVisibility } from "@/lib/profileTypes";
import { getCurrentUser } from "@/lib/session";

type PersonProfilePageProps = {
  params: Promise<{
    username: string;
  }>;
};

function areSameUser(firstUsername: string, secondUsername: string) {
  return (
    firstUsername.trim().toLowerCase() === secondUsername.trim().toLowerCase()
  );
}

function formatJoinedDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function getInitials(displayName: string, username: string) {
  const words = (displayName || username)
    .split(/[\s_]+/)
    .filter(Boolean)
    .slice(0, 2);
  const initials = words.map((word) => word[0]?.toUpperCase()).join("");

  return initials || username[0]?.toUpperCase() || "C";
}

function canViewProfileDetails(
  profileVisibility: ProfileVisibility,
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

function getRelationshipLabel(relationship: ConnectionRelationship) {
  switch (relationship) {
    case "blocked":
      return "Blocked";
    case "connected":
      return "Connected";
    case "incoming_request":
      return "Invitation received";
    case "outgoing_request":
      return "Invitation pending";
    case "none":
      return "Not connected";
  }
}

function getAvailabilityLabel(status: AvailabilityStatus) {
  switch (status) {
    case "open":
      return "Open to messages";
    case "friends_only":
      return "Friends only";
    case "taking_space":
      return "Taking space";
    case "unavailable":
      return "Not available";
  }
}

function getVisibilityMessage(profileVisibility: ProfileVisibility) {
  switch (profileVisibility) {
    case "public":
      return "This profile is visible to everyone.";
    case "friends":
      return "This profile is visible to accepted friends.";
    case "private":
      return "This user keeps their profile details private.";
  }
}

function getActionLink(
  relationship: ConnectionRelationship,
  profileUsername: string,
) {
  switch (relationship) {
    case "connected":
      return {
        href: "/social/chat",
        label: "Open chat",
      };
    case "incoming_request":
      return {
        href: "/social/connections",
        label: "Review invitation",
      };
    case "outgoing_request":
      return {
        href: "/social/connections",
        label: "View invitation",
      };
    case "blocked":
      return {
        href: "/social/connections",
        label: "Manage block",
      };
    case "none":
      return {
        href: `/social/people?search=${encodeURIComponent(profileUsername)}`,
        label: "Find in people search",
      };
  }
}

export default async function PersonProfilePage({
  params,
}: PersonProfilePageProps) {
  const [{ username: requestedUsername }, viewer] = await Promise.all([
    params,
    getCurrentUser(),
  ]);

  if (!viewer) {
    redirect("/auth/login");
  }

  const profileUsername = decodeURIComponent(requestedUsername);

  if (areSameUser(profileUsername, viewer.username)) {
    redirect("/profile");
  }

  const [profileUser, relationshipSummary] = await Promise.all([
    getUserByUsername(profileUsername),
    getConnectionRelationship(viewer.username, profileUsername),
  ]);

  if (!profileUser) {
    notFound();
  }

  const canViewDetails = canViewProfileDetails(
    profileUser.profileVisibility,
    relationshipSummary.relationship,
  );
  const shownDisplayName = canViewDetails
    ? profileUser.displayName
    : `@${profileUser.username}`;
  const shownAvatarImage = canViewDetails ? profileUser.avatarImage : "";
  const initials = getInitials(
    canViewDetails ? profileUser.displayName : "",
    profileUser.username,
  );
  const avatarStyle = shownAvatarImage
    ? { backgroundImage: `url(${JSON.stringify(shownAvatarImage)})` }
    : undefined;
  const actionLink = getActionLink(
    relationshipSummary.relationship,
    profileUser.username,
  );

  return (
    <main className="min-h-screen">
      <AppHeader
        activeSection="friends"
        maxWidth="5xl"
        username={viewer.username}
      />

      <section className="mx-auto w-full max-w-5xl px-6 py-10">
        <Link className="btn btn-secondary btn-sm mb-5" href="/social/people">
          Back to people
        </Link>

        <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
          <article className="motion-panel rounded-md border border-slate-200 bg-white p-6 shadow-sm">
            <div
              aria-label={`${shownDisplayName} profile avatar`}
              className={`grid h-28 w-28 place-items-center rounded-full border border-teal-200 bg-teal-50 bg-cover bg-center text-3xl font-black text-teal-800 shadow-sm ${
                shownAvatarImage ? "" : "bg-none"
              }`}
              role="img"
              style={avatarStyle}
            >
              {shownAvatarImage ? null : initials}
            </div>

            <p className="mt-6 text-sm font-semibold uppercase tracking-normal text-teal-700">
              Profile
            </p>
            <h1 className="mt-2 break-words text-4xl font-bold leading-tight text-slate-950 sm:text-5xl">
              {shownDisplayName}
            </h1>
            <p className="mt-2 text-sm font-semibold text-teal-800">
              @{profileUser.username}
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              <span className="rounded-md bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
                {getRelationshipLabel(relationshipSummary.relationship)}
              </span>
              {canViewDetails ? (
                <span className="rounded-md bg-teal-50 px-3 py-2 text-sm font-bold text-teal-800">
                  {getAvailabilityLabel(profileUser.availabilityStatus)}
                </span>
              ) : null}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="btn btn-primary" href={actionLink.href}>
                {actionLink.label}
              </Link>
              <Link className="btn btn-secondary" href="/social">
                Social home
              </Link>
            </div>
          </article>

          <div className="grid gap-4">
            {canViewDetails ? (
              <VisibleProfileDetails
                bio={profileUser.bio}
                createdAt={profileUser.createdAt}
                friendship={relationshipSummary.friendship}
              />
            ) : (
              <PrivateProfileDetails
                profileVisibility={profileUser.profileVisibility}
                relationship={relationshipSummary.relationship}
              />
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function VisibleProfileDetails({
  bio,
  createdAt,
  friendship,
}: {
  bio: string;
  createdAt: string;
  friendship: Friendship | null;
}) {
  return (
    <>
      <article className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-normal text-slate-500">
          About
        </p>
        <p className="mt-3 leading-7 text-slate-700">
          {bio || "No bio added yet."}
        </p>
      </article>

      <article className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-normal text-slate-500">
          Joined
        </p>
        <p className="mt-2 text-xl font-bold text-slate-950">
          {formatJoinedDate(createdAt)}
        </p>
        {friendship ? (
          <p className="mt-3 text-sm font-semibold text-teal-800">
            Connected since {formatJoinedDate(friendship.createdAt)}
          </p>
        ) : null}
      </article>
    </>
  );
}

function PrivateProfileDetails({
  profileVisibility,
  relationship,
}: {
  profileVisibility: ProfileVisibility;
  relationship: ConnectionRelationship;
}) {
  return (
    <article className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-normal text-slate-500">
        Limited profile
      </p>
      <h2 className="mt-2 text-2xl font-bold text-slate-950">
        Profile details are not visible.
      </h2>
      <p className="mt-3 leading-7 text-slate-700">
        {getVisibilityMessage(profileVisibility)}
      </p>
      {relationship === "blocked" ? (
        <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-900">
          You cannot view profile details while a block is active.
        </p>
      ) : null}
    </article>
  );
}
