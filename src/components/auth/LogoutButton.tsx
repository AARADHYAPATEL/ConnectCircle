"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    setIsLoggingOut(true);

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
    } finally {
      router.push("/auth/login");
      router.refresh();
    }
  }

  return (
    <button
      className="btn btn-secondary btn-sm"
      disabled={isLoggingOut}
      onClick={() => void handleLogout()}
      type="button"
    >
      {isLoggingOut ? "Signing out..." : "Sign out"}
    </button>
  );
}
