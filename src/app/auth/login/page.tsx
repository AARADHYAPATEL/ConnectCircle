import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/AuthForm";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { getCurrentUser } from "@/lib/session";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/");
  }

  return (
    <main className="min-h-screen">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <BrandLogo href="/auth/login" />
      </header>

      <section className="mx-auto grid w-full max-w-5xl gap-8 px-6 py-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
        <div>
          <p className="text-sm font-semibold uppercase tracking-normal text-teal-700">
            Account access
          </p>
          <h1 className="mt-2 text-4xl font-bold leading-tight text-slate-950">
            Keep your check-ins connected to your account.
          </h1>
          <p className="mt-4 leading-7 text-slate-700">
            Sign in to continue using ConnectCircle with your saved entries,
            friends, circles, and messages.
          </p>
        </div>

        <AuthForm mode="login" />
      </section>
    </main>
  );
}
