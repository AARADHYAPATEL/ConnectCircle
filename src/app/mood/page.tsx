import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { getMoodEntries } from "@/lib/moodEntryStore";
import { getCurrentUser } from "@/lib/session";

export default async function MoodPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/login");
  }

  const entries = await getMoodEntries(user.username);
  const latestEntry = entries[0] ?? null;

  return (
    <main className="min-h-screen">
      <AppHeader activeSection="reflect" maxWidth="6xl" username={user.username} />

      <section className="mx-auto w-full max-w-6xl px-6 py-10">
        <div className="grid gap-5 lg:grid-cols-[1fr_0.85fr] lg:items-stretch">
          <div className="motion-panel rounded-md border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-normal text-teal-700">
              Reflect
            </p>
            <h1 className="mt-2 max-w-3xl text-4xl font-bold leading-tight text-slate-950 sm:text-5xl">
              A quiet place to look back.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-700">
              Your check-ins collect here as a private record. Review the words,
              notice patterns, and return only when it feels useful.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="btn btn-dark" href="/mood/entries">
                Open mood history
              </Link>
              <Link className="btn btn-secondary" href="/mood/trends">
                View trends
              </Link>
            </div>
          </div>

          <aside className="rounded-md border border-teal-200 bg-teal-50 p-5 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-normal text-teal-800">
              Current record
            </p>
            <p className="mt-3 text-4xl font-bold text-slate-950">
              {entries.length}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-600">
              {entries.length === 1 ? "saved check-in" : "saved check-ins"}
            </p>
            {latestEntry ? (
              <div className="mt-5 rounded-md bg-white p-4">
                <p className="text-sm font-semibold text-slate-500">
                  Latest mood
                </p>
                <p className="mt-1 text-xl font-bold text-slate-950">
                  {latestEntry.mood}
                </p>
                <p className="mt-1 text-sm font-semibold text-teal-800">
                  {latestEntry.intensity}/5 intensity
                </p>
              </div>
            ) : (
              <p className="mt-5 rounded-md bg-white p-4 text-sm font-semibold leading-6 text-slate-600">
                No entries yet. Start with one simple check-in.
              </p>
            )}
          </aside>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Link
            className="rounded-md border border-amber-200 bg-amber-50 p-5 shadow-sm transition hover:border-amber-400 hover:bg-amber-100"
            href="/mood/entries"
          >
            <p className="text-sm font-semibold uppercase tracking-normal text-amber-800">
              History
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">
              Edit and review entries
            </h2>
            <p className="mt-3 leading-7 text-slate-700">
              Browse saved check-ins without the noise of charts or social
              activity.
            </p>
          </Link>

          <Link
            className="rounded-md border border-rose-200 bg-rose-50 p-5 shadow-sm transition hover:border-rose-400"
            href="/mood/trends"
          >
            <p className="text-sm font-semibold uppercase tracking-normal text-rose-800">
              Trends
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">
              See longer patterns
            </h2>
            <p className="mt-3 leading-7 text-slate-700">
              Weekly, monthly, and yearly visuals help your check-ins become
              easier to understand.
            </p>
          </Link>
        </div>
      </section>
    </main>
  );
}
