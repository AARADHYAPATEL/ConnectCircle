import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { ReportUserPageForm } from "@/components/reports/ReportUserPageForm";
import { getUserByUsername } from "@/lib/authStore";
import { getCurrentUser } from "@/lib/session";

type ReportUserPageProps = {
  params: Promise<{
    username: string;
  }>;
};

function areSameUser(firstUsername: string, secondUsername: string) {
  return (
    firstUsername.trim().toLowerCase() === secondUsername.trim().toLowerCase()
  );
}

export default async function ReportUserPage({ params }: ReportUserPageProps) {
  const [{ username: requestedUsername }, viewer] = await Promise.all([
    params,
    getCurrentUser(),
  ]);

  if (!viewer) {
    redirect("/auth/login");
  }

  const profileUsername = decodeURIComponent(requestedUsername);

  if (areSameUser(profileUsername, viewer.username)) {
    redirect("/profile");
  }

  const profileUser = await getUserByUsername(profileUsername);

  if (!profileUser) {
    notFound();
  }

  const profileHref = `/people/${encodeURIComponent(profileUser.username)}`;

  return (
    <main className="min-h-screen">
      <AppHeader
        activeSection="friends"
        maxWidth="4xl"
        username={viewer.username}
      />

      <section className="mx-auto w-full max-w-3xl px-6 py-10">
        <Link className="btn btn-secondary btn-sm mb-5" href={profileHref}>
          Back to profile
        </Link>

        <ReportUserPageForm
          reportedUsername={profileUser.username}
          returnHref={profileHref}
        />
      </section>
    </main>
  );
}
