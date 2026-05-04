import { redirect } from "next/navigation";
import { PeopleSearchPanel } from "@/components/social/PeopleSearchPanel";
import { SocialPageHeader } from "@/components/social/SocialPageHeader";
import { getCurrentUser } from "@/lib/session";

type PeopleSearchPageProps = {
  searchParams: Promise<{
    q?: string;
    search?: string;
  }>;
};

export default async function PeopleSearchPage({
  searchParams,
}: PeopleSearchPageProps) {
  const [user, resolvedSearchParams] = await Promise.all([
    getCurrentUser(),
    searchParams,
  ]);

  if (!user) {
    redirect("/auth/login");
  }

  const initialQuery = (
    resolvedSearchParams.search ??
    resolvedSearchParams.q ??
    ""
  ).slice(0, 64);

  return (
    <main className="min-h-screen">
      <SocialPageHeader activePage="people" username={user.username} />
      <PeopleSearchPanel initialQuery={initialQuery} />
    </main>
  );
}
