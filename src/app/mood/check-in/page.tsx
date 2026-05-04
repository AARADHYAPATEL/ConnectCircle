import { redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { MoodCheckIn } from "@/components/mood/MoodCheckIn";
import { getCurrentUser } from "@/lib/session";

export default async function MoodCheckInPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <main className="min-h-screen">
      <AppHeader activeSection="today" maxWidth="5xl" username={user.username} />

      <section className="mx-auto grid w-full max-w-5xl gap-8 px-6 py-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
        <div>
          <p className="text-sm font-semibold uppercase tracking-normal text-teal-700">
            Mood check-in
          </p>
          <h1 className="mt-2 text-4xl font-bold leading-tight text-slate-950">
            Describe today in your own words.
          </h1>
          <p className="mt-4 leading-7 text-slate-700">
            Save a focused check-in for your private record, with optional
            details when you want more context.
          </p>
        </div>

        <MoodCheckIn username={user.username} />
      </section>
    </main>
  );
}
