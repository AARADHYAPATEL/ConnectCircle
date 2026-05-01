import Link from "next/link";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { BrandLogo } from "@/components/brand/BrandLogo";

type CirclesPageHeaderProps = {
  username: string;
};

export function CirclesPageHeader({ username }: CirclesPageHeaderProps) {
  return (
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
        <Link className="font-bold text-teal-800" href="/circles">
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
  );
}
