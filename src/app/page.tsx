import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { getConnectionSummary } from "@/lib/connectionStore";
import { getMoodEntries } from "@/lib/moodEntryStore";
import { getCurrentUser } from "@/lib/session";

export default async function Home() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/login");
  }

  const [entries, connectionSummary] = await Promise.all([
    getMoodEntries(user.username),
    getConnectionSummary(user.username),
  ]);
  const hasCheckIn = entries.length > 0;
  const hasFriends = connectionSummary.friends.length > 0;
  const checkInActionLabel = hasCheckIn
    ? "Add today's check-in"
    : "Start your first check-in";
  const startSteps = [
    {
      description: "Capture one clear feeling. Add detail only if it helps.",
      href: "/mood/check-in",
      status: hasCheckIn ? "Complete" : "Next",
      title: "Record today",
    },
    {
      description: "Review your saved entries and notice patterns over time.",
      href: "/mood",
      status: hasCheckIn ? "Ready" : "After first check-in",
      title: "Review privately",
    },
    {
      description: "Invite trusted people when support would be useful.",
      href: "/social/connections",
      status: hasFriends ? "Started" : "Optional",
      title: "Build support",
    },
  ];

  return (
    <main className="min-h-screen">
      <AppHeader username={user.username} />

      <section className="mx-auto w-full max-w-6xl px-6 py-10 lg:py-14">
        <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr] lg:items-stretch">
          <div className="motion-panel rounded-md border border-teal-200 bg-teal-50 p-6 shadow-sm sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-normal text-teal-800">
              Welcome back, @{user.username}
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl font-bold leading-tight text-slate-950 sm:text-5xl">
              Record today&apos;s check-in with clarity.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-700">
              ConnectCircle helps you document how you feel, review patterns,
              and share meaningful updates with people you trust.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="btn btn-dark" href="/mood/check-in">
                {checkInActionLabel}
              </Link>
            </div>
          </div>

          <div className="grid gap-4">
            <article className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold uppercase tracking-normal text-teal-700">
                Recommended path
              </p>
              <h2 className="mt-2 text-2xl font-bold text-slate-950">
                Complete one focused step at a time.
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Begin with a private entry, then use the rest of the app when
                reflection or support becomes useful.
              </p>
              <ol className="mt-5 grid gap-3">
                {startSteps.map((step, index) => (
                  <li key={step.title}>
                    <Link
                      className="group flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-left shadow-sm transition hover:border-teal-300 hover:bg-white hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-300"
                      href={step.href}
                    >
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white text-sm font-bold text-teal-800 transition group-hover:bg-teal-50">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-bold text-slate-950 transition group-hover:text-teal-800">
                            {step.title}
                          </span>
                          <span className="rounded-md bg-white px-2 py-1 text-xs font-bold text-slate-500 transition group-hover:text-teal-800">
                            {step.status}
                          </span>
                        </div>
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                          {step.description}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ol>
            </article>

            <article className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold uppercase tracking-normal text-slate-500">
                Support network
              </p>
              <h2 className="mt-2 text-2xl font-bold text-slate-950">
                Share with purpose.
              </h2>
              <p className="mt-3 leading-7 text-slate-700">
                Keep conversations one-to-one with friends, or use circles for
                focused group support.
              </p>
            </article>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Link
            className="rounded-md border border-sky-200 bg-sky-50 p-5 shadow-sm transition hover:border-sky-400 hover:bg-sky-100"
            href="/social"
          >
            <p className="text-sm font-semibold uppercase tracking-normal text-sky-800">
              Friends
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">
              Individual chat and direct support
            </h2>
            <p className="mt-3 leading-7 text-slate-700">
              Manage requests, chat privately, send support notes, and view
              moods shared directly with you.
            </p>
          </Link>

          <Link
            className="rounded-md border border-amber-200 bg-amber-50 p-5 shadow-sm transition hover:border-amber-400 hover:bg-amber-100"
            href="/circles"
          >
            <p className="text-sm font-semibold uppercase tracking-normal text-amber-800">
              Groups
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">
              Private rooms for trusted groups
            </h2>
            <p className="mt-3 leading-7 text-slate-700">
              Create member-approved circles with shared check-ins and a
              dedicated group chat.
            </p>
          </Link>
        </div>
      </section>
    </main>
  );
}
