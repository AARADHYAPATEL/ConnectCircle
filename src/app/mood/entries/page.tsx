import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { MoodEntriesList } from "@/components/mood/MoodEntriesList";
import { getCurrentUser } from "@/lib/session";

export default async function MoodEntriesPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <main className="min-h-screen">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-5">
        <BrandLogo />
        <Link
          className="btn btn-secondary btn-sm"
          href="/mood/check-in"
        >
          Check in
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm font-semibold text-slate-600 sm:inline">
            @{user.username}
          </span>
          <LogoutButton />
        </div>
      </header>

      <MoodEntriesList username={user.username} />
    </main>
  );
}
