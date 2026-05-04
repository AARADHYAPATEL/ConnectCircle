import Link from "next/link";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { getUserByUsername } from "@/lib/authStore";
import { getNotificationSummary } from "@/lib/notificationStore";

type AppSection =
  | "home"
  | "today"
  | "reflect"
  | "friends"
  | "groups"
  | "profile"
  | "feedback";

type AppHeaderProps = {
  activeSection?: AppSection;
  maxWidth?: "4xl" | "5xl" | "6xl" | "7xl";
  username: string;
};

const maxWidthClassBySize = {
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
  "7xl": "max-w-7xl",
} satisfies Record<NonNullable<AppHeaderProps["maxWidth"]>, string>;

const navLinks: Array<{
  href: string;
  label: string;
  section: AppSection;
}> = [
  {
    href: "/mood/check-in",
    label: "Today",
    section: "today",
  },
  {
    href: "/mood",
    label: "Reflect",
    section: "reflect",
  },
  {
    href: "/social",
    label: "Friends",
    section: "friends",
  },
  {
    href: "/circles",
    label: "Groups",
    section: "groups",
  },
  {
    href: "/feedback",
    label: "Feedback",
    section: "feedback",
  },
];

function getAvatarInitials(displayName: string, username: string) {
  const words = (displayName || username)
    .split(/[\s_]+/)
    .filter(Boolean)
    .slice(0, 2);
  const initials = words.map((word) => word[0]?.toUpperCase()).join("");

  return initials || username[0]?.toUpperCase() || "C";
}

function getAvailabilityLabel(status: string | undefined) {
  switch (status) {
    case "friends_only":
      return "Friends only";
    case "taking_space":
      return "Taking space";
    case "unavailable":
      return "Not available";
    case "open":
    default:
      return "Open to messages";
  }
}

function getProfileBioPreview(bio: string | undefined) {
  const cleanBio = bio?.trim();

  if (!cleanBio) {
    return "No bio added yet.";
  }

  return cleanBio;
}

export async function AppHeader({
  activeSection = "home",
  maxWidth = "6xl",
  username,
}: AppHeaderProps) {
  const [notificationSummary, profileUser] = await Promise.all([
    getNotificationSummary(username),
    getUserByUsername(username),
  ]);
  const displayName = profileUser?.displayName ?? username;
  const avatarImage = profileUser?.avatarImage ?? "";
  const avatarInitials = getAvatarInitials(displayName, username);
  const availabilityLabel = getAvailabilityLabel(
    profileUser?.availabilityStatus,
  );
  const bioPreview = getProfileBioPreview(profileUser?.bio);
  const avatarStyle = avatarImage
    ? { backgroundImage: `url(${JSON.stringify(avatarImage)})` }
    : undefined;

  return (
    <header
      className={`relative z-[1000] mx-auto flex w-full ${maxWidthClassBySize[maxWidth]} items-center justify-between gap-4 px-6 py-5`}
    >
      <BrandLogo />
      <nav className="hidden items-center gap-2 rounded-md border border-slate-200 bg-white/70 p-1 text-sm font-bold text-slate-600 shadow-sm sm:flex">
        {navLinks.map((link) => {
          const isActive = activeSection === link.section;

          return (
            <Link
              className={`rounded-md px-3 py-2 transition ${
                isActive
                  ? "bg-teal-50 text-teal-800"
                  : "hover:bg-slate-50 hover:text-slate-950"
              }`}
              href={link.href}
              key={link.href}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center gap-3">
        <NotificationBell summary={notificationSummary} />
        <div className="group/profile-preview relative">
          <Link
            aria-label="Open profile"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-teal-50 bg-cover bg-center text-sm font-black text-teal-800 shadow-sm transition hover:border-teal-300 hover:bg-teal-100 hover:text-teal-900 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-200"
            href="/profile"
            style={avatarStyle}
          >
            {avatarImage ? null : avatarInitials}
          </Link>
          <div className="pointer-events-none absolute right-0 top-full z-[1100] w-72 translate-y-1 pt-3 text-left opacity-0 transition group-hover/profile-preview:pointer-events-auto group-hover/profile-preview:translate-y-0 group-hover/profile-preview:opacity-100 group-focus-within/profile-preview:pointer-events-auto group-focus-within/profile-preview:translate-y-0 group-focus-within/profile-preview:opacity-100">
            <div className="rounded-md border border-slate-200 bg-white p-4 shadow-xl shadow-slate-950/10 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30">
              <div className="flex items-center gap-3">
                <div
                  aria-hidden="true"
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-teal-200 bg-teal-50 bg-cover bg-center text-base font-black text-teal-800 dark:border-teal-500/35 dark:bg-teal-950/40 dark:text-teal-100"
                  style={avatarStyle}
                >
                  {avatarImage ? null : avatarInitials}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-slate-950 dark:text-white">
                    {displayName}
                  </p>
                  <p className="mt-0.5 truncate text-sm font-semibold text-teal-700 dark:text-teal-200">
                    @{username}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-md bg-teal-50 px-2.5 py-1.5 text-xs font-bold text-teal-800 dark:bg-teal-950/40 dark:text-teal-100">
                  {availabilityLabel}
                </span>
                <span className="rounded-md bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                  Profile preview
                </span>
              </div>

              <p className="mt-3 break-words text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">
                {bioPreview}
              </p>
              <p className="mt-3 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">
                Go to profile to view and manage all details.
              </p>
              <Link
                className="btn btn-primary btn-sm mt-4 w-full justify-center"
                href="/profile"
              >
                Go to profile
              </Link>
            </div>
          </div>
        </div>
        <LogoutButton />
      </div>
    </header>
  );
}
