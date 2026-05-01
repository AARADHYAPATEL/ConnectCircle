import { redirect } from "next/navigation";
import { CirclesPageHeader } from "@/components/circles/CirclesPageHeader";
import { CirclesPanel } from "@/components/circles/CirclesPanel";
import { getCurrentUser } from "@/lib/session";

export default async function CirclesPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <main className="min-h-screen">
      <CirclesPageHeader username={user.username} />
      <CirclesPanel username={user.username} />
    </main>
  );
}
