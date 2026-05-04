import Link from "next/link";
import { redirect } from "next/navigation";
import { SocialPageHeader } from "@/components/social/SocialPageHeader";
import { getCurrentUser } from "@/lib/session";

const socialSections = [
  {
    accent: "text-teal-800",
    border: "border-teal-200 bg-teal-50 hover:border-teal-400 hover:bg-teal-100",
    description:
      "Send requests, review pending invitations, and manage accepted friends.",
    href: "/social/connections",
    title: "Requests and friends",
  },
  {
    accent: "text-rose-800",
    border: "border-rose-200 bg-rose-50 hover:border-rose-400",
    description: "Continue a private conversation with one accepted friend.",
    href: "/social/chat",
    title: "One-to-one chat",
  },
  {
    accent: "text-amber-800",
    border: "border-amber-200 bg-amber-50 hover:border-amber-400 hover:bg-amber-100",
    description: "Send a short supportive note without opening a full chat.",
    href: "/social/support",
    title: "Support notes",
  },
  {
    accent: "text-sky-800",
    border: "border-sky-200 bg-sky-50 hover:border-sky-400 hover:bg-sky-100",
    description: "Review check-ins friends have intentionally shared with you.",
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
            Stay connected with trusted friends.
          </h1>
          <p className="mt-4 max-w-3xl leading-7 text-slate-700">
            Use this area for direct support: find people, manage requests,
            send notes, chat privately, and view check-ins shared with you.
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
