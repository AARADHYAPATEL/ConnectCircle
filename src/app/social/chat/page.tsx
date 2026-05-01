import { redirect } from "next/navigation";
import { ChatPanel } from "@/components/social/ChatPanel";
import { SocialPageHeader } from "@/components/social/SocialPageHeader";
import { getCurrentUser } from "@/lib/session";

export default async function ChatPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <main className="min-h-screen">
      <SocialPageHeader activePage="chat" username={user.username} />
      <ChatPanel username={user.username} />
    </main>
  );
}
