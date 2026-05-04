import Link from "next/link";
import { AppHeader } from "@/components/layout/AppHeader";

type SocialPage =
  | "overview"
  | "people"
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
    href: "/social/people",
    label: "Find people",
    page: "people",
  },
  {
    href: "/social/connections",
    label: "Friends",
    page: "connections",
  },
  {
    href: "/social/chat",
    label: "Chat",
    page: "chat",
  },
];

const secondarySocialLinks: Array<{
  href: string;
  label: string;
  page: SocialPage;
}> = [
  {
    href: "/social",
    label: "Social home",
    page: "overview",
  },
  {
    href: "/social/support",
    label: "Support notes",
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
        className="mx-auto w-full max-w-5xl px-6 pb-2"
      >
        <div className="rounded-md border border-slate-200 bg-white/75 p-2 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/72 dark:shadow-black/20">
          <div className="grid grid-cols-3 gap-1">
          {socialLinks.map((link) => (
            <Link
              className={`flex min-h-10 items-center justify-center rounded-md px-3 text-sm font-black transition ${
                activePage === link.page
                  ? "bg-teal-600 text-white shadow-sm dark:bg-teal-500 dark:text-slate-950"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
              }`}
              href={link.href}
              key={link.href}
            >
              {link.label}
            </Link>
          ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-slate-200 pt-2 dark:border-slate-700">
            {secondarySocialLinks.map((link) => (
              <Link
                className={`rounded-md px-3 py-2 text-xs font-black uppercase tracking-normal transition ${
                  activePage === link.page
                    ? "bg-teal-50 text-teal-800 dark:bg-teal-500/15 dark:text-teal-200"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                }`}
                href={link.href}
                key={link.href}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>
    </>
  );
}
