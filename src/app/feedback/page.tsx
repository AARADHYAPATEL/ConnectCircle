import { redirect } from "next/navigation";
import { FeedbackForm } from "@/components/feedback/FeedbackForm";
import { AppHeader } from "@/components/layout/AppHeader";
import { getCurrentUser } from "@/lib/session";

export default async function FeedbackPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <main className="min-h-screen">
      <AppHeader activeSection="feedback" maxWidth="5xl" username={user.username} />

      <section className="mx-auto grid w-full max-w-5xl gap-6 px-6 py-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
        <div>
          <p className="text-sm font-semibold uppercase tracking-normal text-teal-700">
            Feedback
          </p>
          <h1 className="mt-2 text-4xl font-bold leading-tight text-slate-950">
            Help improve ConnectCircle.
          </h1>
          <p className="mt-4 leading-7 text-slate-700">
            Report bugs, confusing moments, missing features, or anything that
            would make the app clearer and more reliable.
          </p>
          <div className="mt-6 rounded-md border border-teal-200 bg-teal-50 p-4">
            <h2 className="text-lg font-bold text-slate-950">
              What happens after you submit?
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              Your feedback is saved for review. If email delivery is
              configured, a copy is also sent to the developer as a structured
              attachment.
            </p>
          </div>
        </div>

        <FeedbackForm username={user.username} />
      </section>
    </main>
  );
}
