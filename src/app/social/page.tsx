import Link from "next/link";
import { redirect } from "next/navigation";
import { SocialPageHeader } from "@/components/social/SocialPageHeader";
import { getCurrentUser } from "@/lib/session";

const socialSections = [
  {
    accent: "text-teal-800",
    border: "border-teal-200 bg-teal-50 hover:border-teal-400 hover:bg-teal-100",
    description: "Start here when you want to add someone or review your accepted friends.",
    href: "/social/connections",
    title: "Friend requests",
  },
  {
    accent: "text-rose-800",
    border: "border-rose-200 bg-rose-50 hover:border-rose-400",
    description: "A private chat space for one friend at a time.",
    href: "/social/chat",
    title: "One-to-one chat",
  },
  {
    accent: "text-amber-800",
    border: "border-amber-200 bg-amber-50 hover:border-amber-400 hover:bg-amber-100",
    description: "Short encouragement without opening a full conversation.",
    href: "/social/support",
    title: "Kind notes",
  },
  {
    accent: "text-sky-800",
    border: "border-sky-200 bg-sky-50 hover:border-sky-400 hover:bg-sky-100",
    description: "A quiet feed of check-ins that friends chose to share.",
    href: "/social/feed",
    title: "Shared moods",
  },
] as const;

export default async function SocialPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <main className="min-h-screen">
      <SocialPageHeader activePage="overview" username={user.username} />

      <section className="mx-auto w-full max-w-5xl px-6 py-10">
        <div className="motion-panel rounded-md border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-normal text-teal-700">
            Friends
          </p>
          <h1 className="mt-2 max-w-3xl text-4xl font-bold leading-tight text-slate-950">
            Individual support, without the noise.
          </h1>
          <p className="mt-4 max-w-3xl leading-7 text-slate-700">
            This area is for one-to-one connection: adding friends, sending a
            quick note, chatting privately, or reading moods shared directly
            with you.
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {socialSections.map((section) => (
            <Link
              className={`rounded-md border p-5 shadow-sm transition ${section.border}`}
              href={section.href}
              key={section.href}
            >
              <p
                className={`text-sm font-semibold uppercase tracking-normal ${section.accent}`}
              >
                {section.title}
              </p>
              <p className="mt-4 leading-7 text-slate-700">
                {section.description}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
