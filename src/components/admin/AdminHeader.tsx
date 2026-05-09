import Link from "next/link";
import { AdminLogoutButton } from "@/components/admin/AdminLogoutButton";
import { BrandLogo } from "@/components/brand/BrandLogo";
import type { PublicAdminUser } from "@/lib/adminStore";

type AdminHeaderProps = {
  admin: PublicAdminUser;
};

export function AdminHeader({ admin }: AdminHeaderProps) {
  return (
    <header className="relative z-[1000] mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-5">
      <div className="flex items-center gap-4">
        <BrandLogo href="/admin/reports" />
        <span className="rounded-md bg-rose-50 px-3 py-2 text-sm font-bold text-rose-800">
          Admin
        </span>
      </div>
      <nav className="hidden items-center gap-2 rounded-md border border-slate-200 bg-white/70 p-1 text-sm font-bold text-slate-600 shadow-sm sm:flex">
        <Link
          className="rounded-md bg-teal-50 px-3 py-2 text-teal-800 transition hover:bg-teal-100"
          href="/admin/reports"
        >
          Reports
        </Link>
      </nav>
      <div className="flex items-center gap-3">
        <span className="hidden text-sm font-bold text-slate-600 sm:inline">
          @{admin.username}
        </span>
        <AdminLogoutButton />
      </div>
    </header>
  );
}

