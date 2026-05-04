import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/AuthForm";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { getCurrentUser } from "@/lib/session";

export default async function RegisterPage() {
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
            Create your account
          </p>
          <h1 className="mt-2 text-4xl font-bold leading-tight text-slate-950">
            Start with a private ConnectCircle profile.
          </h1>
          <p className="mt-4 leading-7 text-slate-700">
            Choose a username and secure sign-in details so your check-ins,
            connections, and circles stay organized.
          </p>
        </div>

        <AuthForm mode="register" />
      </section>
    </main>
  );
}
