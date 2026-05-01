import { redirect } from "next/navigation";
import { CircleRoomPanel } from "@/components/circles/CircleRoomPanel";
import { CirclesPageHeader } from "@/components/circles/CirclesPageHeader";
import { getCurrentUser } from "@/lib/session";

type CircleChatPageProps = {
  params: Promise<{
    circleId: string;
  }>;
};

export default async function CircleChatPage({ params }: CircleChatPageProps) {
  const { circleId } = await params;
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <main className="min-h-screen">
      <CirclesPageHeader username={user.username} />
      <CircleRoomPanel circleId={circleId} username={user.username} />
    </main>
  );
}
