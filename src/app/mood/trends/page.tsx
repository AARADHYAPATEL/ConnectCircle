import { redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { MoodTrendsDashboard } from "@/components/mood/MoodTrendsDashboard";
import { getMoodEntries } from "@/lib/moodEntryStore";
import { getCurrentUser } from "@/lib/session";

export default async function MoodTrendsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/login");
  }

  const entries = await getMoodEntries(user.username);

  return (
    <main className="min-h-screen">
      <AppHeader activeSection="reflect" maxWidth="7xl" username={user.username} />

      <MoodTrendsDashboard entries={entries} username={user.username} />
    </main>
  );
}
