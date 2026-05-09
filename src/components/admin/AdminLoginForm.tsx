"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

async function readErrorMessage(response: Response) {
  try {
    const data: { error?: string } = await response.json();

    return data.error || "Admin sign-in failed.";
  } catch {
    return "Admin sign-in failed.";
  }
}

export function AdminLoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canSubmit =
    username.trim().length > 0 && password.length > 0 && !isSubmitting;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      router.push("/admin/reports");
      router.refresh();
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "Admin sign-in failed.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      className="motion-panel rounded-md border border-slate-200 bg-white p-6 shadow-sm"
      onSubmit={handleSubmit}
    >
      <p className="text-sm font-semibold uppercase tracking-normal text-teal-700">
        Admin access
      </p>
      <h1 className="mt-2 text-3xl font-bold leading-tight text-slate-950">
        Sign in to report review.
      </h1>
      <p className="mt-3 leading-7 text-slate-700">
        This area is separate from student accounts and only contains safety
        report review tools.
      </p>

      <label className="mt-6 block text-sm font-semibold text-slate-700">
        Admin username
        <input
          autoComplete="username"
          className="mt-2 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-900 outline-none focus:border-teal-500 focus:bg-white"
          onChange={(event) => setUsername(event.target.value)}
          placeholder="owner_admin"
          value={username}
        />
      </label>

      <label className="mt-5 block text-sm font-semibold text-slate-700">
        Admin password
        <input
          autoComplete="current-password"
          className="mt-2 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-900 outline-none focus:border-teal-500 focus:bg-white"
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Your admin password"
          type="password"
          value={password}
        />
      </label>

      {error ? (
        <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-900">
          {error}
        </p>
      ) : null}

      <button
        className="btn btn-primary mt-5 w-full"
        disabled={!canSubmit}
        type="submit"
      >
        {isSubmitting ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}

