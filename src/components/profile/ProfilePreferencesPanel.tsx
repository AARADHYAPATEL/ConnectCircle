"use client";

import { type FormEvent, useState } from "react";
import type { AvailabilityStatus, ThemePreference } from "@/lib/profileTypes";

type PreferencesUser = {
  availabilityStatus: AvailabilityStatus;
  themePreference: ThemePreference;
};

type PreferencesResponse = {
  error?: string;
  user?: PreferencesUser;
};

type ProfilePreferencesPanelProps = {
  initialUser: PreferencesUser;
};

const availabilityOptions: Array<{
  description: string;
  label: string;
  value: AvailabilityStatus;
}> = [
  {
    description: "Friends can message you normally.",
    label: "Open to messages",
    value: "open",
  },
  {
    description: "Keep support focused on accepted friends.",
    label: "Friends only",
    value: "friends_only",
  },
  {
    description: "Let people know you are taking a little space.",
    label: "Taking space",
    value: "taking_space",
  },
  {
    description: "Show that you are not available right now.",
    label: "Not available",
    value: "unavailable",
  },
];

const themeOptions: Array<{
  description: string;
  label: string;
  value: ThemePreference;
}> = [
  {
    description: "Match the setting from your device or browser.",
    label: "System",
    value: "system",
  },
  {
    description: "Use the lighter ConnectCircle interface.",
    label: "Light",
    value: "light",
  },
  {
    description: "Use the darker ConnectCircle interface.",
    label: "Dark",
    value: "dark",
  },
];

function applyThemePreference(themePreference: ThemePreference) {
  if (themePreference === "system") {
    document.documentElement.removeAttribute("data-theme");
    return;
  }

  document.documentElement.dataset.theme = themePreference;
}

export function ProfilePreferencesPanel({
  initialUser,
}: ProfilePreferencesPanelProps) {
  const [savedAvailabilityStatus, setSavedAvailabilityStatus] = useState(
    initialUser.availabilityStatus,
  );
  const [savedThemePreference, setSavedThemePreference] = useState(
    initialUser.themePreference,
  );
  const [availabilityStatus, setAvailabilityStatus] = useState(
    initialUser.availabilityStatus,
  );
  const [themePreference, setThemePreference] = useState(
    initialUser.themePreference,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const hasChanges =
    availabilityStatus !== savedAvailabilityStatus ||
    themePreference !== savedThemePreference;

  function handleCancel() {
    setAvailabilityStatus(savedAvailabilityStatus);
    setThemePreference(savedThemePreference);
    applyThemePreference(savedThemePreference);
    setError("");
    setSuccessMessage("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!hasChanges || isSaving) {
      return;
    }

    setIsSaving(true);
    setError("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/profile/preferences", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          availabilityStatus,
          themePreference,
        }),
      });
      const data = (await response.json()) as PreferencesResponse;

      if (!response.ok || !data.user) {
        setError(data.error ?? "Preferences could not be updated.");
        return;
      }

      setSavedAvailabilityStatus(data.user.availabilityStatus);
      setSavedThemePreference(data.user.themePreference);
      setAvailabilityStatus(data.user.availabilityStatus);
      setThemePreference(data.user.themePreference);
      applyThemePreference(data.user.themePreference);
      setSuccessMessage("Preferences updated.");
    } catch {
      setError("We could not reach the preferences service.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form
      className="rounded-md border border-slate-200 bg-white p-5 shadow-sm"
      onSubmit={handleSubmit}
    >
      <div>
        <p className="text-sm font-semibold uppercase tracking-normal text-teal-700">
          Availability
        </p>
        <h2 className="mt-2 text-2xl font-bold text-slate-950">
          Set your current availability
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
          This status helps shape how people understand your current capacity
          for support and conversation.
        </p>
      </div>

      <fieldset className="mt-5 grid gap-3 md:grid-cols-2">
        <legend className="sr-only">Availability status</legend>
        {availabilityOptions.map((option) => (
          <label
            className={`cursor-pointer rounded-md border p-4 transition ${
              availabilityStatus === option.value
                ? "border-teal-300 bg-teal-50"
                : "border-slate-200 bg-slate-50 hover:border-teal-300 hover:bg-teal-50"
            }`}
            key={option.value}
          >
            <input
              checked={availabilityStatus === option.value}
              className="sr-only"
              name="availabilityStatus"
              onChange={() => {
                setAvailabilityStatus(option.value);
                setError("");
                setSuccessMessage("");
              }}
              type="radio"
              value={option.value}
            />
            <span className="block text-sm font-bold text-slate-950">
              {option.label}
            </span>
            <span className="mt-2 block text-sm leading-6 text-slate-600">
              {option.description}
            </span>
          </label>
        ))}
      </fieldset>

      <div className="mt-8 border-t border-slate-200 pt-6">
        <p className="text-sm font-semibold uppercase tracking-normal text-sky-700">
          Theme
        </p>
        <h2 className="mt-2 text-2xl font-bold text-slate-950">
          Choose how ConnectCircle looks
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
          Select a fixed light or dark theme, or let ConnectCircle follow your
          system setting.
        </p>
      </div>

      <fieldset className="mt-5 grid gap-3 md:grid-cols-3">
        <legend className="sr-only">Theme preference</legend>
        {themeOptions.map((option) => (
          <label
            className={`cursor-pointer rounded-md border p-4 transition ${
              themePreference === option.value
                ? "border-sky-300 bg-sky-50"
                : "border-slate-200 bg-slate-50 hover:border-sky-300 hover:bg-sky-50"
            }`}
            key={option.value}
          >
            <input
              checked={themePreference === option.value}
              className="sr-only"
              name="themePreference"
              onChange={() => {
                setThemePreference(option.value);
                applyThemePreference(option.value);
                setError("");
                setSuccessMessage("");
              }}
              type="radio"
              value={option.value}
            />
            <span className="block text-sm font-bold text-slate-950">
              {option.label}
            </span>
            <span className="mt-2 block text-sm leading-6 text-slate-600">
              {option.description}
            </span>
          </label>
        ))}
      </fieldset>

      {error ? (
        <p className="mt-5 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-900">
          {error}
        </p>
      ) : null}

      {successMessage ? (
        <p className="mt-5 rounded-md border border-teal-200 bg-teal-50 p-3 text-sm font-semibold text-teal-900">
          {successMessage}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          className="btn btn-primary"
          disabled={!hasChanges || isSaving}
          type="submit"
        >
          {isSaving ? "Saving..." : "Save preferences"}
        </button>
        <button
          className="btn btn-secondary"
          disabled={!hasChanges || isSaving}
          onClick={handleCancel}
          type="button"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

