"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Circle } from "@/lib/circleTypes";
import { getCircleSharingTargetText } from "@/lib/circleSharingText";
import type { SavedMoodEntry } from "@/lib/moodTypes";

type MoodEntriesListProps = {
  username: string;
};

function formatEntryDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function getSharingText(entry: SavedMoodEntry, circles: Circle[]) {
  if (entry.audience === "Selected circles") {
    return `Shared with ${getCircleSharingTargetText(
      entry.sharedCircleIds,
      circles,
    )}`;
  }

  if (entry.sharedWith.length === 0) {
    return "Private";
  }

  if (entry.audience === "Circle feed") {
    return `Shared with ${entry.sharedWith.length} friends`;
  }

  return `Shared with ${entry.sharedWith
    .map((friendUsername) => `@${friendUsername}`)
    .join(", ")}`;
}

export function MoodEntriesList({ username }: MoodEntriesListProps) {
  const [circles, setCircles] = useState<Circle[]>([]);
  const [entries, setEntries] = useState<SavedMoodEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadEntries() {
      try {
        const [entriesResponse, circlesResponse] = await Promise.all([
          fetch("/api/mood-entries", {
            cache: "no-store",
          }),
          fetch("/api/circles", {
            cache: "no-store",
          }),
        ]);

        if (!entriesResponse.ok) {
          throw new Error("Could not load check-ins.");
        }

        const data: { entries: SavedMoodEntry[] } =
          await entriesResponse.json();
        const circlesData: { circles: Circle[] } = circlesResponse.ok
          ? await circlesResponse.json()
          : { circles: [] };

        if (isActive) {
          setCircles(circlesData.circles);
          setEntries(data.entries);
          setError("");
        }
      } catch {
        if (isActive) {
          setError("Check-ins could not be loaded.");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadEntries();

    return () => {
      isActive = false;
    };
  }, []);

  async function handleDeleteEntry(entry: SavedMoodEntry) {
    const shouldDelete = window.confirm(
      `Delete the entry for "${entry.mood}"? This cannot be undone.`,
    );

    if (!shouldDelete) {
      return;
    }

    setDeletingEntryId(entry.id);
    setError("");

    try {
      const response = await fetch("/api/mood-entries", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: entry.id }),
      });

      if (!response.ok) {
        throw new Error("Could not delete check-in.");
      }

      setEntries((currentEntries) =>
        currentEntries.filter((currentEntry) => currentEntry.id !== entry.id),
      );
    } catch {
      setError("Check-in could not be deleted.");
    } finally {
      setDeletingEntryId(null);
    }
  }

  return (
    <section
      aria-labelledby="mood-entry-history-title"
      className="mx-auto w-full max-w-4xl px-6 py-10"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-normal text-teal-700">
            Mood history
          </p>
          <h1
            className="mt-2 text-4xl font-bold text-slate-950"
            id="mood-entry-history-title"
          >
            Your mood history
          </h1>
          <p className="mt-3 max-w-2xl leading-7 text-slate-700">
            A private record of check-ins saved under @{username}.
          </p>
        </div>
        <Link
          className="btn btn-primary"
          href="/mood/check-in"
        >
          New check-in
        </Link>
      </div>

      {isLoading ? (
        <div className="mt-8 rounded-md border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-600">
          Loading mood history...
        </div>
      ) : null}

      {error ? (
        <div className="mt-8 rounded-md border border-rose-200 bg-rose-50 p-5 text-sm font-semibold text-rose-900">
          {error}
        </div>
      ) : null}

      {!isLoading && !error && entries.length === 0 ? (
        <div className="mt-8 rounded-md border border-dashed border-slate-300 bg-white p-6">
          <h2 className="text-lg font-bold text-slate-950">
            No check-ins yet
          </h2>
          <p className="mt-2 leading-7 text-slate-600">
            Saved check-ins will appear here after your first entry.
          </p>
        </div>
      ) : null}

      {!isLoading && !error && entries.length > 0 ? (
        <div className="mt-8 grid gap-4">
          {entries.map((entry) => (
            <article
              className="rounded-md border border-slate-200 bg-white p-5 shadow-sm"
              key={entry.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-slate-950">
                    Feeling {entry.mood}
                  </h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    {formatEntryDate(entry.createdAt)}
                  </p>
                </div>
                <span className="rounded-md bg-teal-50 px-3 py-2 text-sm font-bold text-teal-800">
                  {entry.intensity}/5
                </span>
              </div>
              <p className="mt-4 text-sm font-semibold text-slate-700">
                {entry.supportNeed}
              </p>
              <p className="mt-2 text-sm font-semibold text-sky-800">
                {getSharingText(entry, circles)}
              </p>
              {entry.note ? (
                <p className="mt-3 rounded-md bg-slate-50 p-4 leading-7 text-slate-700">
                  {entry.note}
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                <Link
                  className="btn btn-secondary btn-sm"
                  href={`/mood/entries/${entry.id}/edit`}
                >
                  Edit
                </Link>
                <button
                  className="btn btn-danger btn-sm"
                  disabled={deletingEntryId === entry.id}
                  onClick={() => void handleDeleteEntry(entry)}
                  type="button"
                >
                  {deletingEntryId === entry.id ? "Deleting..." : "Delete"}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
