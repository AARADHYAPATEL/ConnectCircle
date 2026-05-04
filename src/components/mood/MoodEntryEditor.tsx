"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Circle } from "@/lib/circleTypes";
import { getCircleSharingTargetText } from "@/lib/circleSharingText";
import {
  moodLimit,
  moodSuggestions,
  noteLimit,
  supportOptions,
  type Audience,
  type MoodSuggestion,
  type SavedMoodEntry,
  type SupportNeed,
} from "@/lib/moodTypes";

type MoodEntryEditorProps = {
  entryId: string;
};

export function MoodEntryEditor({ entryId }: MoodEntryEditorProps) {
  const [moodText, setMoodText] = useState("");
  const [selectedSuggestion, setSelectedSuggestion] =
    useState<MoodSuggestion | null>(null);
  const [intensity, setIntensity] = useState(3);
  const [audience, setAudience] = useState<Audience>("Only me");
  const [circles, setCircles] = useState<Circle[]>([]);
  const [sharedCircleIds, setSharedCircleIds] = useState<string[]>([]);
  const [sharedWith, setSharedWith] = useState<string[]>([]);
  const [supportNeed, setSupportNeed] =
    useState<SupportNeed>("Open to talking");
  const [note, setNote] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const trimmedMood = moodText.trim();
  const canSave = trimmedMood.length > 0 && !isLoading && !isSaving;

  useEffect(() => {
    let isActive = true;

    async function loadEntry() {
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
        const entry = data.entries.find((currentEntry) => currentEntry.id === entryId);

        if (!entry) {
          throw new Error("Entry was not found.");
        }

        if (isActive) {
          setCircles(circlesData.circles);
          setMoodText(entry.mood);
          setIntensity(entry.intensity);
          setAudience(entry.audience);
          setSharedCircleIds(entry.sharedCircleIds);
          setSharedWith(entry.sharedWith);
          setSupportNeed(entry.supportNeed);
          setNote(entry.note);
          setSelectedSuggestion(getMatchingSuggestion(entry.mood));
          setError("");
        }
      } catch {
        if (isActive) {
          setError("This check-in could not be loaded.");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadEntry();

    return () => {
      isActive = false;
    };
  }, [entryId]);

  function handleMoodInput(value: string) {
    setMoodText(value);
    setSelectedSuggestion(getMatchingSuggestion(value));
    setSuccessMessage("");
  }

  function handleSuggestionClick(suggestion: MoodSuggestion) {
    setSelectedSuggestion(suggestion);
    setMoodText(suggestion);
    setSuccessMessage("");
  }

  async function handleSaveChanges() {
    if (!canSave) {
      return;
    }

    setIsSaving(true);
    setError("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/mood-entries", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: entryId,
          mood: trimmedMood,
          intensity,
          audience,
          supportNeed,
          note: note.trim(),
          sharedCircleIds,
          sharedWith,
        }),
      });

      if (!response.ok) {
        throw new Error("Check-in could not be updated.");
      }

      setSuccessMessage("Check-in updated.");
    } catch {
      setError("We could not update this check-in. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-600">
        Loading check-in...
      </div>
    );
  }

  if (error && !moodText) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 p-5">
        <p className="text-sm font-semibold text-rose-900">{error}</p>
        <Link
          className="btn btn-danger btn-sm mt-4"
          href="/mood/entries"
        >
          Back to history
        </Link>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="edit-mood-entry-title"
      className="rounded-md border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div>
        <p className="text-sm font-semibold text-slate-500">Saved check-in</p>
        <h2
          className="mt-1 text-2xl font-bold text-slate-950"
          id="edit-mood-entry-title"
        >
          Edit check-in
        </h2>
      </div>

      <div className="mt-6 rounded-md border border-teal-100 bg-teal-50/60 p-4">
        <label
          className="block text-sm font-semibold text-slate-800"
          htmlFor="edit-mood-text"
        >
          Mood or feeling
        </label>
        <input
          className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-base font-semibold text-slate-950 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-200"
          id="edit-mood-text"
          maxLength={moodLimit}
          onChange={(event) => handleMoodInput(event.target.value)}
          placeholder="Nervous but excited, peaceful, left out..."
          value={moodText}
        />
        <div className="mt-2 flex items-center justify-between gap-3 text-xs font-semibold text-slate-500">
          <span>Use a suggestion or keep your own wording.</span>
          <span>
            {moodText.length}/{moodLimit}
          </span>
        </div>
      </div>

      <fieldset className="mt-5">
        <legend className="text-sm font-semibold text-slate-700">
          Suggested mood words
        </legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {moodSuggestions.map((suggestion) => {
            const isSelected = suggestion === selectedSuggestion;

            return (
              <button
                aria-pressed={isSelected}
                className={
                  isSelected ? "mood-chip mood-chip-selected" : "mood-chip"
                }
                key={suggestion}
                onClick={() => handleSuggestionClick(suggestion)}
                type="button"
              >
                {suggestion}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="mt-5 block text-sm font-semibold text-slate-700">
        Intensity
        <span className="ml-2 text-slate-500">{intensity}/5</span>
        <input
          className="mt-3 block w-full accent-teal-700"
          max="5"
          min="1"
          onChange={(event) => {
            setIntensity(Number(event.target.value));
            setSuccessMessage("");
          }}
          type="range"
          value={intensity}
        />
      </label>

      <label className="mt-5 block text-sm font-semibold text-slate-700">
        Support preference
        <select
          className="mt-2 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-800 outline-none focus:border-teal-500 focus:bg-white"
          onChange={(event) => {
            setSupportNeed(event.target.value as SupportNeed);
            setSuccessMessage("");
          }}
          value={supportNeed}
        >
          {supportOptions.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </label>

      {sharedCircleIds.length > 0 ? (
        <p className="mt-4 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm font-semibold text-sky-900">
          Shared with {getCircleSharingTargetText(sharedCircleIds, circles)}.
        </p>
      ) : sharedWith.length > 0 ? (
        <p className="mt-4 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm font-semibold text-sky-900">
          Shared with{" "}
          {sharedWith.map((friendUsername) => `@${friendUsername}`).join(", ")}.
        </p>
      ) : null}

      <label className="mt-5 block text-sm font-semibold text-slate-700">
        Additional context
        <textarea
          className="mt-2 min-h-28 w-full resize-none rounded-md border border-slate-300 bg-slate-50 p-3 text-sm text-slate-900 outline-none focus:border-teal-500 focus:bg-white"
          maxLength={noteLimit}
          onChange={(event) => {
            setNote(event.target.value);
            setSuccessMessage("");
          }}
          placeholder="What happened, what you need, or anything you want to remember..."
          value={note}
        />
      </label>
      <div className="mt-1 text-right text-xs font-semibold text-slate-500">
        {note.length}/{noteLimit}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          className="btn btn-primary"
          disabled={!canSave}
          onClick={() => void handleSaveChanges()}
          type="button"
        >
          {isSaving ? "Saving..." : "Save changes"}
        </button>
        <Link
          className="btn btn-secondary"
          href="/mood/entries"
        >
          Back to history
        </Link>
      </div>

      {error ? (
        <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-900">
          {error}
        </p>
      ) : null}

      {successMessage ? (
        <p className="mt-4 rounded-md border border-teal-200 bg-teal-50 p-3 text-sm font-semibold text-teal-900">
          {successMessage}
        </p>
      ) : null}
    </section>
  );
}

function getMatchingSuggestion(value: string) {
  return (
    moodSuggestions.find(
      (suggestion) => suggestion.toLowerCase() === value.trim().toLowerCase(),
    ) ?? null
  );
}
