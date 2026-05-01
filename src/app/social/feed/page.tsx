import { redirect } from "next/navigation";
import { SharedMoodFeed } from "@/components/social/SharedMoodFeed";
import { SocialPageHeader } from "@/components/social/SocialPageHeader";
import { getCurrentUser } from "@/lib/session";

export default async function SocialFeedPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <main className="min-h-screen">
      <SocialPageHeader activePage="feed" username={user.username} />
      <SharedMoodFeed />
    </main>
  );
}
