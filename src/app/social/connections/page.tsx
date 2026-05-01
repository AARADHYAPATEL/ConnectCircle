import { redirect } from "next/navigation";
import { ConnectionsPanel } from "@/components/social/ConnectionsPanel";
import { SocialPageHeader } from "@/components/social/SocialPageHeader";
import { getCurrentUser } from "@/lib/session";

export default async function ConnectionsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <main className="min-h-screen">
      <SocialPageHeader activePage="connections" username={user.username} />
      <ConnectionsPanel username={user.username} />
    </main>
  );
}
