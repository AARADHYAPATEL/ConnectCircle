import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { MoodCheckIn } from "@/components/mood/MoodCheckIn";
import { getCurrentUser } from "@/lib/session";

export default async function MoodCheckInPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <main className="min-h-screen">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <BrandLogo />
        <Link
          className="btn btn-secondary btn-sm"
          href="/mood/entries"
        >
          My entries
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm font-semibold text-slate-600 sm:inline">
            @{user.username}
          </span>
          <LogoutButton />
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-5xl gap-8 px-6 py-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
        <div>
          <p className="text-sm font-semibold uppercase tracking-normal text-teal-700">
            Mood check-in
          </p>
          <h1 className="mt-2 text-4xl font-bold leading-tight text-slate-950">
            Put today into your own words.
          </h1>
          <p className="mt-4 leading-7 text-slate-700">
            This space is for a quick, honest check-in that saves to your
            personal mood entries.
          </p>
        </div>

        <MoodCheckIn username={user.username} />
      </section>
    </main>
  );
}
