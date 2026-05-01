import Link from "next/link";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { BrandLogo } from "@/components/brand/BrandLogo";

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
    label: "Overview",
    page: "overview",
  },
  {
    href: "/social/connections",
    label: "Connections",
    page: "connections",
  },
  {
    href: "/social/chat",
    label: "Chat",
    page: "chat",
  },
  {
    href: "/social/support",
    label: "Support",
    page: "support",
  },
  {
    href: "/social/feed",
    label: "Mood feed",
    page: "feed",
  },
];

export function SocialPageHeader({
  activePage,
  username,
}: SocialPageHeaderProps) {
  return (
    <>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <BrandLogo />
        <nav className="hidden items-center gap-6 text-sm font-medium text-slate-700 sm:flex">
          <Link className="hover:text-slate-950" href="/mood/check-in">
            Check in
          </Link>
          <Link className="hover:text-slate-950" href="/mood/entries">
            My entries
          </Link>
          <Link className="hover:text-slate-950" href="/social">
            Social
          </Link>
          <Link className="hover:text-slate-950" href="/circles">
            Circles
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm font-semibold text-slate-600 sm:inline">
            @{username}
          </span>
          <LogoutButton />
        </div>
      </header>

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
