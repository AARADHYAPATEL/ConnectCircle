import { redirect } from "next/navigation";
import { SocialPageHeader } from "@/components/social/SocialPageHeader";
import { SupportMessagesPanel } from "@/components/social/SupportMessagesPanel";
import { getCurrentUser } from "@/lib/session";

export default async function SupportPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <main className="min-h-screen">
      <SocialPageHeader activePage="support" username={user.username} />
      <SupportMessagesPanel username={user.username} />
    </main>
  );
}
