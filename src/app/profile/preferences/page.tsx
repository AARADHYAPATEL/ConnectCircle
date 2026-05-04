import { redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { ProfilePreferencesPanel } from "@/components/profile/ProfilePreferencesPanel";
import { ProfileSectionNav } from "@/components/profile/ProfileSectionNav";
import { getCurrentUser } from "@/lib/session";

export default async function ProfilePreferencesPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <main className="min-h-screen">
      <AppHeader activeSection="profile" maxWidth="5xl" username={user.username} />

      <section className="mx-auto w-full max-w-5xl px-6 py-10">
        <ProfileSectionNav activeSection="preferences" />

        <div className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-normal text-teal-700">
            Profile
          </p>
          <h1 className="mt-2 text-4xl font-bold leading-tight text-slate-950 sm:text-5xl">
            Preferences
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-700">
            Set your availability and choose the theme that feels most
            comfortable for daily use.
          </p>
        </div>

        <ProfilePreferencesPanel initialUser={user} />
      </section>
    </main>
  );
}

