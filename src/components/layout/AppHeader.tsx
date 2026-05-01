import Link from "next/link";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { BrandLogo } from "@/components/brand/BrandLogo";

type AppSection = "home" | "today" | "reflect" | "friends" | "groups";

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
];

export function AppHeader({
  activeSection = "home",
  maxWidth = "6xl",
  username,
}: AppHeaderProps) {
  return (
    <header
      className={`mx-auto flex w-full ${maxWidthClassBySize[maxWidth]} items-center justify-between gap-4 px-6 py-5`}
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
        <span className="hidden text-sm font-semibold text-slate-600 md:inline">
          @{username}
        </span>
        <LogoutButton />
      </div>
    </header>
  );
}
