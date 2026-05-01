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
  const nextAction = !hasCheckIn
    ? {
        href: "/mood/check-in",
        label: "Start the first check-in",
      }
    : !hasFriends
      ? {
          href: "/social/connections",
          label: "Add trusted support",
        }
      : {
          href: "/mood",
          label: "Reflect on your pattern",
        };
  const startSteps = [
    {
      description: "Name one feeling. Details can wait.",
      href: "/mood/check-in",
      status: hasCheckIn ? "Done" : "Next",
      title: "Begin with today",
    },
    {
      description: "Your history and trends unlock meaning over time.",
      href: "/mood",
      status: hasCheckIn ? "Ready" : "After first check-in",
      title: "Look back privately",
    },
    {
      description: "Invite friends only when sharing would actually help.",
      href: "/social/connections",
      status: hasFriends ? "Started" : "Optional",
      title: "Add support gently",
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
              Start with how today feels.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-700">
              A check-in is the center of ConnectCircle. Everything else helps
              you reflect on those entries or share them with the right people.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="btn btn-dark" href={nextAction.href}>
                {nextAction.label}
              </Link>
              <Link className="btn btn-secondary" href="/mood/check-in">
                Quick check-in
              </Link>
            </div>
          </div>

          <div className="grid gap-4">
            <article className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold uppercase tracking-normal text-teal-700">
                Start here
              </p>
              <h2 className="mt-2 text-2xl font-bold text-slate-950">
                One calm step at a time.
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                ConnectCircle works best when it starts private, then grows only
                as you need support.
              </p>
              <ol className="mt-5 grid gap-3">
                {startSteps.map((step, index) => (
                  <li
                    className="rounded-md border border-slate-200 bg-slate-50 p-3"
                    key={step.title}
                  >
                    <div className="flex items-start gap-3">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white text-sm font-bold text-teal-800">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Link
                            className="font-bold text-slate-950 hover:text-teal-800"
                            href={step.href}
                          >
                            {step.title}
                          </Link>
                          <span className="rounded-md bg-white px-2 py-1 text-xs font-bold text-slate-500">
                            {step.status}
                          </span>
                        </div>
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                          {step.description}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </article>

            <article className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold uppercase tracking-normal text-slate-500">
                Support when needed
              </p>
              <h2 className="mt-2 text-2xl font-bold text-slate-950">
                Share with intention.
              </h2>
              <p className="mt-3 leading-7 text-slate-700">
                Keep things one-to-one with friends, or use group circles for a
                smaller shared room.
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
              Individual chats and support
            </h2>
            <p className="mt-3 leading-7 text-slate-700">
              Friend requests, one-to-one chat, support messages, and moods
              shared directly with you.
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
              Private rooms for closer circles
            </h2>
            <p className="mt-3 leading-7 text-slate-700">
              Named groups with member approvals, shared check-ins, and a
              dedicated CircleChat.
            </p>
          </Link>
        </div>
      </section>
    </main>
  );
}
