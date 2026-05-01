import Link from "next/link";
import { redirect } from "next/navigation";
import { SocialPageHeader } from "@/components/social/SocialPageHeader";
import { getCurrentUser } from "@/lib/session";

const socialSections = [
  {
    accent: "text-teal-800",
    border: "border-teal-200 hover:border-teal-400",
    description: "Manage friend requests and see accepted friends.",
    href: "/social/connections",
    title: "Connections",
  },
  {
    accent: "text-rose-800",
    border: "border-rose-200 hover:border-rose-400",
    description: "Open live-style conversations with accepted friends.",
    href: "/social/chat",
    title: "Live chat",
  },
  {
    accent: "text-fuchsia-800",
    border: "border-fuchsia-200 hover:border-fuchsia-400",
    description: "Send kind notes and read support from friends.",
    href: "/social/support",
    title: "Support messages",
  },
  {
    accent: "text-sky-800",
    border: "border-sky-200 hover:border-sky-400",
    description: "View mood check-ins friends shared with you.",
    href: "/social/feed",
    title: "Friend mood feed",
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
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-normal text-teal-700">
            Social space
          </p>
          <h1 className="mt-2 text-4xl font-bold leading-tight text-slate-950">
            Keep friend activity organized.
          </h1>
          <p className="mt-4 leading-7 text-slate-700">
            Connections, supportive messages, live chats, and shared moods now
            live in separate spaces so each workflow has room to breathe.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {socialSections.map((section) => (
            <Link
              className={`rounded-md border bg-white p-5 shadow-sm transition hover:bg-slate-50 ${section.border}`}
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
