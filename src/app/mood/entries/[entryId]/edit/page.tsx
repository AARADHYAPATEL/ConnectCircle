import { redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { MoodEntryEditor } from "@/components/mood/MoodEntryEditor";
import { getCurrentUser } from "@/lib/session";

type EditMoodEntryPageProps = {
  params: Promise<{
    entryId: string;
  }>;
};

export default async function EditMoodEntryPage({
  params,
}: EditMoodEntryPageProps) {
  const { entryId } = await params;
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <main className="min-h-screen">
      <AppHeader activeSection="reflect" maxWidth="5xl" username={user.username} />

      <section className="mx-auto grid w-full max-w-5xl gap-8 px-6 py-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
        <div>
          <p className="text-sm font-semibold uppercase tracking-normal text-teal-700">
            Edit entry
          </p>
          <h1 className="mt-2 text-4xl font-bold leading-tight text-slate-950">
            Refine a saved check-in.
          </h1>
          <p className="mt-4 leading-7 text-slate-700">
            Update the wording, intensity, support preference, or context for
            this entry.
          </p>
        </div>

        <MoodEntryEditor entryId={entryId} />
      </section>
    </main>
  );
}
