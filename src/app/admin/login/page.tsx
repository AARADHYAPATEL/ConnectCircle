import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { getCurrentAdmin } from "@/lib/adminSession";

export default async function AdminLoginPage() {
  const admin = await getCurrentAdmin();

  if (admin) {
    redirect("/admin/reports");
  }

  return (
    <main className="min-h-screen">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-6 py-5">
        <BrandLogo />
        <Link className="btn btn-secondary btn-sm" href="/">
          Student app
        </Link>
      </header>
      <section className="mx-auto grid w-full max-w-4xl gap-6 px-6 py-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-normal text-rose-700">
            Safety operations
          </p>
          <h2 className="mt-2 text-3xl font-bold leading-tight text-slate-950">
            Separate from student accounts.
          </h2>
          <p className="mt-3 leading-7 text-slate-700">
            Admin access is only for reviewing reports and downloading report
            files. Regular ConnectCircle features are not available here.
          </p>
          <div className="mt-5 grid gap-3 text-sm font-semibold text-slate-600">
            <p className="rounded-md bg-slate-50 p-3">
              Configure the first admin with environment variables.
            </p>
            <p className="rounded-md bg-slate-50 p-3">
              Passwords are stored as salted hashes in the local data store.
            </p>
            <p className="rounded-md bg-slate-50 p-3">
              Failed login attempts are rate-limited.
            </p>
          </div>
        </div>
        <AdminLoginForm />
      </section>
    </main>
  );
}

