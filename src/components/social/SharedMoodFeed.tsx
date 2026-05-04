"use client";

import { useEffect, useState } from "react";
import type { Circle } from "@/lib/circleTypes";
import { getCircleSharingTargetText } from "@/lib/circleSharingText";
import type { SavedMoodEntry } from "@/lib/moodTypes";

function formatEntryDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function SharedMoodFeed() {
  const [circles, setCircles] = useState<Circle[]>([]);
  const [entries, setEntries] = useState<SavedMoodEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isActive = true;

    async function loadSharedMoods() {
      try {
        const [entriesResponse, circlesResponse] = await Promise.all([
          fetch("/api/shared-moods", {
            cache: "no-store",
          }),
          fetch("/api/circles", {
            cache: "no-store",
          }),
        ]);

        if (!entriesResponse.ok) {
          throw new Error("Could not load shared moods.");
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
          setError("Shared moods could not be loaded.");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadSharedMoods();

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <section
      aria-labelledby="shared-moods-title"
      className="mx-auto w-full max-w-5xl px-6 py-10"
    >
      <div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-normal text-sky-700">
              Shared check-ins
            </p>
            <h2
              className="mt-2 text-3xl font-bold text-slate-950"
              id="shared-moods-title"
            >
              Check-ins shared with you
            </h2>
          </div>
        </div>

        {isLoading ? (
          <div className="mt-6 rounded-md border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-600">
            Loading shared check-ins...
          </div>
        ) : null}

        {error ? (
          <div className="mt-6 rounded-md border border-rose-200 bg-rose-50 p-5 text-sm font-semibold text-rose-900">
            {error}
          </div>
        ) : null}

        {!isLoading && !error && entries.length === 0 ? (
          <div className="mt-6 rounded-md border border-dashed border-slate-300 bg-white p-5">
            <p className="text-sm font-semibold leading-6 text-slate-600">
              Check-ins that friends share with you will appear here.
            </p>
          </div>
        ) : null}

        {!isLoading && !error && entries.length > 0 ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {entries.map((entry) => (
              <article
                className="rounded-md border border-slate-200 bg-white p-5 shadow-sm"
                key={entry.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-500">
                      @{entry.username}
                    </p>
                    <h3 className="mt-1 text-xl font-bold text-slate-950">
                      Feeling {entry.mood}
                    </h3>
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
                {entry.sharedCircleIds.length > 0 ? (
                  <p className="mt-2 text-sm font-semibold text-teal-800">
                    Shared through{" "}
                    {getCircleSharingTargetText(entry.sharedCircleIds, circles)}
                  </p>
                ) : null}
                {entry.note ? (
                  <p className="mt-3 rounded-md bg-slate-50 p-4 leading-7 text-slate-700">
                    {entry.note}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
