import Link from "next/link";
import { AppHeader } from "@/components/layout/AppHeader";

type SocialPage =
  | "overview"
  | "connections"
  | "chat"
  | "support"
  | "feed";

type SocialPageHeaderProps = {
  activePage: SocialPage;
  username: string;
};

const socialLinks: Array<{
  href: string;
  label: string;
  page: SocialPage;
}> = [
  {
    href: "/social",
    label: "Start",
    page: "overview",
  },
  {
    href: "/social/connections",
    label: "Requests",
    page: "connections",
  },
  {
    href: "/social/chat",
    label: "Chat",
    page: "chat",
  },
  {
    href: "/social/support",
    label: "Kind notes",
    page: "support",
  },
  {
    href: "/social/feed",
    label: "Shared moods",
    page: "feed",
  },
];

export function SocialPageHeader({
  activePage,
  username,
}: SocialPageHeaderProps) {
  return (
    <>
      <AppHeader activeSection="friends" username={username} />

      <nav
        aria-label="Social sections"
        className="mx-auto w-full max-w-5xl px-6"
      >
        <div className="flex gap-2 overflow-x-auto border-b border-slate-200 pb-3">
          {socialLinks.map((link) => (
            <Link
              className={`btn btn-sm whitespace-nowrap ${
                activePage === link.page ? "btn-dark" : "btn-secondary"
              }`}
              href={link.href}
              key={link.href}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
