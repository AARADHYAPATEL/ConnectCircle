import { redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { MoodEntriesList } from "@/components/mood/MoodEntriesList";
import { getCurrentUser } from "@/lib/session";

export default async function MoodEntriesPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <main className="min-h-screen">
      <AppHeader activeSection="reflect" maxWidth="4xl" username={user.username} />

      <MoodEntriesList username={user.username} />
    </main>
  );
}
