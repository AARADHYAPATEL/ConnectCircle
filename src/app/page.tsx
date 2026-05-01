import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { getCurrentUser } from "@/lib/session";

export default async function Home() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <main className="min-h-screen">
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
          <Link className="hover:text-slate-950" href="/circles">
            Circles
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm font-semibold text-slate-600 sm:inline">
            @{user.username}
          </span>
          <LogoutButton />
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-6xl gap-8 px-6 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-16">
        <div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-normal text-teal-700">
            Student wellbeing space
          </p>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight text-slate-950 sm:text-5xl">
            A calmer way to understand your day and track how you feel.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-700">
            ConnectCircle starts with a private mood check-in flow so students
            can name what they feel, save personal entries, and look back at
            patterns over time. Your entries are saved under @{user.username}.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              className="btn btn-dark"
              href="/mood/check-in"
            >
              Start a check-in
            </Link>
            <Link
              className="btn btn-secondary"
              href="/mood/entries"
            >
              View mood entries
            </Link>
            <Link
              className="btn btn-primary"
              href="/social"
            >
              Open social
            </Link>
            <Link
              className="btn btn-secondary"
              href="/circles"
            >
              Open circles
            </Link>
          </div>
        </div>

        <div className="grid gap-4">
          <Link
            className="rounded-md border border-teal-200 bg-teal-50 p-5 shadow-sm transition hover:border-teal-400 hover:bg-teal-100"
            href="/mood/check-in"
          >
            <p className="text-sm font-semibold uppercase tracking-normal text-teal-800">
              Mood check-in
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">
              Put today into words
            </h2>
            <p className="mt-3 leading-7 text-slate-700">
              Capture your mood, intensity, support preference, and private
              context from a focused page.
            </p>
          </Link>

          <Link
            className="rounded-md border border-amber-200 bg-amber-50 p-5 shadow-sm transition hover:border-amber-400 hover:bg-amber-100"
            href="/mood/entries"
          >
            <p className="text-sm font-semibold uppercase tracking-normal text-amber-800">
              Personal history
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">
              See your mood entries
            </h2>
            <p className="mt-3 leading-7 text-slate-700">
              Review and manage saved check-ins in a separate, quieter space.
            </p>
          </Link>

          <Link
            className="rounded-md border border-sky-200 bg-sky-50 p-5 shadow-sm transition hover:border-sky-400 hover:bg-sky-100"
            href="/social"
          >
            <p className="text-sm font-semibold uppercase tracking-normal text-sky-800">
              Social
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">
              Build your circle
            </h2>
            <p className="mt-3 leading-7 text-slate-700">
              Manage connections, send support, and view shared moods from a
              cleaner social hub.
            </p>
          </Link>

          <Link
            className="rounded-md border border-teal-200 bg-teal-50 p-5 shadow-sm transition hover:border-teal-400 hover:bg-teal-100"
            href="/circles"
          >
            <p className="text-sm font-semibold uppercase tracking-normal text-teal-800">
              Circles
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">
              Gather closer groups
            </h2>
            <p className="mt-3 leading-7 text-slate-700">
              Create circles, broadcast check-ins to them, and open CircleChat
              without crowding the social hub.
            </p>
          </Link>
        </div>
      </section>
    </main>
  );
}
