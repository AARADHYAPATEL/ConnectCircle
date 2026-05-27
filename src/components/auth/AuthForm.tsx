"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";

type AuthFormProps = {
  mode: "login" | "register";
};

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isRegister = mode === "register";
  const googleError = getGoogleErrorMessage(searchParams.get("error"));
  const canSubmit =
    email.trim().length > 0 &&
    password.length > 0 &&
    (!isRegister || username.trim().length > 0) &&
    !isSubmitting;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch(
        isRegister ? "/api/auth/register" : "/api/auth/login",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: username.trim(),
            email: email.trim(),
            password,
          }),
        },
      );
      const data: { error?: string } = await response.json();

      if (!response.ok) {
        setError(data.error ?? "We could not complete this request.");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("We could not reach the authentication service.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      className="rounded-md border border-slate-200 bg-white p-5 shadow-sm"
      onSubmit={handleSubmit}
    >
      <div>
        <p className="text-sm font-semibold uppercase tracking-normal text-teal-700">
          {isRegister ? "Create account" : "Welcome back"}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">
          {isRegister ? "Set up your profile" : "Sign in to ConnectCircle"}
        </h1>
        <p className="mt-3 leading-7 text-slate-700">
          {isRegister
            ? "Your entries, friends, and circles will be saved under your username."
            : "Use your email and password to return to your workspace."}
        </p>
      </div>

      <a
        className="btn btn-secondary mt-5 w-full gap-2"
        href={`/api/auth/google/start?mode=${mode}`}
      >
        <GoogleLogo />
        Continue with Google
      </a>

      {googleError ? (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
          {googleError}
        </p>
      ) : null}

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-slate-200" />
        <span className="text-xs font-bold uppercase tracking-normal text-slate-400">
          or
        </span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      {isRegister ? (
        <label className="block text-sm font-semibold text-slate-700">
          Username
          <input
            className="mt-2 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-900 outline-none focus:border-teal-500 focus:bg-white"
            onChange={(event) => setUsername(event.target.value)}
            placeholder="aaradhya_01"
            value={username}
          />
        </label>
      ) : null}

      <label className="mt-5 block text-sm font-semibold text-slate-700">
        Email
        <input
          className="mt-2 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-900 outline-none focus:border-teal-500 focus:bg-white"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          type="email"
          value={email}
        />
      </label>

      <label className="mt-5 block text-sm font-semibold text-slate-700">
        Password
        <input
          className="mt-2 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-900 outline-none focus:border-teal-500 focus:bg-white"
          onChange={(event) => setPassword(event.target.value)}
          placeholder={isRegister ? "At least 8 characters" : "Your password"}
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
          {isSubmitting
            ? isRegister
            ? "Creating account..."
            : "Signing in..."
          : isRegister
            ? "Create account"
            : "Sign in"}
      </button>

      <p className="mt-5 text-center text-sm text-slate-600">
        {isRegister ? "Already have an account?" : "New to ConnectCircle?"}{" "}
        <Link
          className="font-bold text-teal-700 hover:text-teal-900"
          href={isRegister ? "/auth/login" : "/auth/register"}
        >
          {isRegister ? "Sign in" : "Create one"}
        </Link>
      </p>
    </form>
  );
}

function GoogleLogo() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5 shrink-0"
      viewBox="0 0 24 24"
    >
      <path
        d="M21.6 12.23c0-.74-.07-1.45-.19-2.13H12v4.03h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.89-1.74 2.98-4.31 2.98-7.43Z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.7 0 4.96-.89 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.81-1.76-5.6-4.12H3.06v2.59A9.99 9.99 0 0 0 12 22Z"
        fill="#34A853"
      />
      <path
        d="M6.4 13.92a6 6 0 0 1 0-3.84V7.49H3.06a10.01 10.01 0 0 0 0 9.02l3.34-2.59Z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.96c1.47 0 2.79.51 3.83 1.5l2.87-2.87C16.96 2.97 14.7 2 12 2a9.99 9.99 0 0 0-8.94 5.49l3.34 2.59C7.19 7.72 9.4 5.96 12 5.96Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function getGoogleErrorMessage(error: string | null) {
  switch (error) {
    case "google_not_configured":
      return "Google sign-in is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local.";
    case "google_state":
      return "Google sign-in could not be verified. Please try again.";
    case "google_token":
      return "Google did not return a valid sign-in token. Please try again.";
    case "google_profile":
      return "Google did not return a verified email profile. Use another account or sign in with email.";
    case "google_private_ip":
      return "Google sign-in requires a public HTTPS URL. Use email and password locally, or open the app through a public tunnel.";
    case "database_not_configured":
      return "ConnectCircle's production database is not connected yet. Add DATABASE_URL or POSTGRES_URL in Vercel, then redeploy.";
    default:
      return "";
  }
}
