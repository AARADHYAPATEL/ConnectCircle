"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Circle } from "@/lib/circleTypes";
import { getCircleSharingTargetText } from "@/lib/circleSharingText";
import type { ConnectionSummary, Friendship } from "@/lib/connectionTypes";
import {
  moodLimit,
  moodSuggestions,
  noteLimit,
  personalAudience,
  supportOptions,
  type Audience,
  type MoodSuggestion,
  type SavedMoodEntry,
  type SupportNeed,
} from "@/lib/moodTypes";

const shareOptions: Array<{
  description: string;
  label: string;
  value: Audience;
}> = [
  {
    description: "Keep this check-in in your personal mood entries.",
    label: "Only me",
    value: personalAudience,
  },
  {
    description: "Send this check-in to every accepted friend.",
    label: "All friends",
    value: "Circle feed",
  },
  {
    description: "Pick exactly who should receive this check-in.",
    label: "Selected friends",
    value: "Chosen friends",
  },
  {
    description: "Broadcast this check-in into one or more circles.",
    label: "Selected circles",
    value: "Selected circles",
  },
];

function getFriendUsername(friendship: Friendship, username: string) {
  return (
    friendship.usernames.find(
      (friendUsername) =>
        friendUsername.toLowerCase() !== username.toLowerCase(),
    ) ?? friendship.usernames[0]
  );
}

type MoodCheckInProps = {
  username: string;
};

export function MoodCheckIn({ username }: MoodCheckInProps) {
  const [moodText, setMoodText] = useState("");
  const [selectedSuggestion, setSelectedSuggestion] =
    useState<MoodSuggestion | null>(null);
  const [intensity, setIntensity] = useState(3);
  const [audience, setAudience] = useState<Audience>(personalAudience);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [friendUsernames, setFriendUsernames] = useState<string[]>([]);
  const [selectedCircleIds, setSelectedCircleIds] = useState<string[]>([]);
  const [selectedFriendUsernames, setSelectedFriendUsernames] = useState<
    string[]
  >([]);
  const [supportNeed, setSupportNeed] =
    useState<SupportNeed>("No advice needed");
  const [note, setNote] = useState("");
  const [savedCheckIn, setSavedCheckIn] = useState<SavedMoodEntry | null>(null);
  const [isAddingDetails, setIsAddingDetails] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingCircles, setIsLoadingCircles] = useState(true);
  const [isLoadingFriends, setIsLoadingFriends] = useState(true);
  const [circleError, setCircleError] = useState("");
  const [error, setError] = useState("");
  const [friendError, setFriendError] = useState("");

  const trimmedMood = moodText.trim();
  const isSharingWithAllFriends = audience === "Circle feed";
  const isChoosingFriends = audience === "Chosen friends";
  const isChoosingCircles = audience === "Selected circles";
  const hasCircles = circles.length > 0;
  const hasFriends = friendUsernames.length > 0;
  const canSave =
    trimmedMood.length > 0 &&
    !isSaving &&
    (!isSharingWithAllFriends || hasFriends) &&
    (!isChoosingFriends || selectedFriendUsernames.length > 0) &&
    (!isChoosingCircles || selectedCircleIds.length > 0);

  useEffect(() => {
    let isActive = true;

    async function loadFriends() {
      try {
        const response = await fetch("/api/connections", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Could not load friends.");
        }

        const data: ConnectionSummary = await response.json();
        const friends = data.friends
          .map((friendship) => getFriendUsername(friendship, username))
          .filter(Boolean)
          .sort((first, second) => first.localeCompare(second));

        if (isActive) {
          setFriendUsernames(friends);
          setFriendError("");
        }
      } catch {
        if (isActive) {
          setFriendError("Friends could not be loaded right now.");
        }
      } finally {
        if (isActive) {
          setIsLoadingFriends(false);
        }
      }
    }

    void loadFriends();

    return () => {
      isActive = false;
    };
  }, [username]);

  useEffect(() => {
    let isActive = true;

    async function loadCircles() {
      try {
        const response = await fetch("/api/circles", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Could not load circles.");
        }

        const data: { circles: Circle[] } = await response.json();

        if (isActive) {
          setCircles(data.circles);
          setCircleError("");
        }
      } catch {
        if (isActive) {
          setCircleError("Circles could not be loaded right now.");
        }
      } finally {
        if (isActive) {
          setIsLoadingCircles(false);
        }
      }
    }

    void loadCircles();

    return () => {
      isActive = false;
    };
  }, []);

  function handleMoodInput(value: string) {
    setMoodText(value);

    const matchingSuggestion = moodSuggestions.find(
      (suggestion) => suggestion.toLowerCase() === value.trim().toLowerCase(),
    );
    setSelectedSuggestion(matchingSuggestion ?? null);
  }

  function handleSuggestionClick(suggestion: MoodSuggestion) {
    setSelectedSuggestion(suggestion);
    setMoodText(suggestion);
  }

  function handleAudienceChange(nextAudience: Audience) {
    const needsFriends =
      nextAudience === "Circle feed" || nextAudience === "Chosen friends";
    const needsCircles = nextAudience === "Selected circles";

    if ((needsFriends && !hasFriends) || (needsCircles && !hasCircles)) {
      return;
    }

    setAudience(nextAudience);
    setSavedCheckIn(null);

    if (nextAudience !== "Chosen friends") {
      setSelectedFriendUsernames([]);
    }

    if (nextAudience !== "Selected circles") {
      setSelectedCircleIds([]);
    }
  }

  function toggleCircleSelection(circleId: string) {
    setSelectedCircleIds((currentCircleIds) =>
      currentCircleIds.includes(circleId)
        ? currentCircleIds.filter((currentCircleId) => currentCircleId !== circleId)
        : [...currentCircleIds, circleId],
    );
  }

  function toggleFriendSelection(friendUsername: string) {
    setSelectedFriendUsernames((currentFriendUsernames) =>
      currentFriendUsernames.includes(friendUsername)
        ? currentFriendUsernames.filter(
            (currentFriendUsername) =>
              currentFriendUsername !== friendUsername,
          )
        : [...currentFriendUsernames, friendUsername],
    );
  }

  async function handleSave() {
    if (!canSave) {
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const response = await fetch("/api/mood-entries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mood: trimmedMood,
          intensity,
          audience,
          supportNeed,
          note: note.trim(),
          sharedCircleIds: isChoosingCircles ? selectedCircleIds : [],
          sharedWith: isChoosingFriends ? selectedFriendUsernames : [],
        }),
      });

      if (!response.ok) {
        throw new Error("Mood entry could not be saved.");
      }

      const data: { entry: SavedMoodEntry } = await response.json();

      setSavedCheckIn(data.entry);
      setMoodText("");
      setSelectedSuggestion(null);
      setNote("");
      setIntensity(3);
      setAudience(personalAudience);
      setSelectedCircleIds([]);
      setSelectedFriendUsernames([]);
      setSupportNeed("No advice needed");
      setIsAddingDetails(false);
    } catch {
      setError("Something went wrong while saving this check-in.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section
      aria-labelledby="mood-check-in-title"
      className="rounded-md border border-slate-200 bg-white p-5 shadow-sm"
      id="check-in"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500">Today</p>
          <h2
            className="mt-1 text-2xl font-bold text-slate-950"
            id="mood-check-in-title"
          >
            How are you feeling?
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Type one feeling and save, or add details if you want the fuller
            check-in.
          </p>
        </div>
        <span className="rounded-md bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-800">
          {isAddingDetails
            ? audience === personalAudience
              ? "Private"
              : "Shared mood"
            : "Quick check-in"}
        </span>
      </div>

      <div className="mt-6 rounded-md border border-teal-100 bg-teal-50/60 p-4">
        <label
          className="block text-sm font-semibold text-slate-800"
          htmlFor="mood-text"
        >
          Put your mood in your own words
        </label>
        <input
          className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-base font-semibold text-slate-950 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-200"
          id="mood-text"
          maxLength={moodLimit}
          onChange={(event) => handleMoodInput(event.target.value)}
          placeholder="nervous but excited, peaceful, left out..."
          value={moodText}
        />
        <div className="mt-2 flex items-center justify-between gap-3 text-xs font-semibold text-slate-500">
          <span>Suggestions are only starters. Your words count.</span>
          <span>
            {moodText.length}/{moodLimit}
          </span>
        </div>
      </div>

      <fieldset className="mt-5">
        <legend className="text-sm font-semibold text-slate-700">
          Quick mood words
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

      <button
        aria-expanded={isAddingDetails}
        className="btn btn-secondary mt-5 w-full"
        onClick={() =>
          setIsAddingDetails((currentIsAddingDetails) => !currentIsAddingDetails)
        }
        type="button"
      >
        {isAddingDetails ? "Hide details" : "Add details"}
      </button>

      {isAddingDetails ? (
        <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-4">
          <label className="block text-sm font-semibold text-slate-700">
            How strong does it feel?
            <span className="ml-2 text-slate-500">{intensity}/5</span>
            <input
              className="mt-3 block w-full accent-teal-700"
              max="5"
              min="1"
              onChange={(event) => setIntensity(Number(event.target.value))}
              type="range"
              value={intensity}
            />
          </label>

          <label className="mt-5 block text-sm font-semibold text-slate-700">
            Support signal
            <select
              className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-sm font-semibold text-slate-800 outline-none focus:border-teal-500 focus:bg-white"
              onChange={(event) =>
                setSupportNeed(event.target.value as SupportNeed)
              }
              value={supportNeed}
            >
              {supportOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>

          <fieldset className="mt-5 rounded-md border border-slate-200 bg-white p-4">
            <legend className="text-sm font-semibold text-slate-800">
              Share this check-in
            </legend>
            <div className="mt-3 grid gap-3">
              {shareOptions.map((option) => {
                const isSelected = audience === option.value;
                const isDisabled =
                  ((option.value === "Circle feed" ||
                    option.value === "Chosen friends") &&
                    !hasFriends) ||
                  (option.value === "Selected circles" && !hasCircles);

                return (
                  <label
                    className={`flex cursor-pointer gap-3 rounded-md border bg-white p-3 transition ${
                      isSelected
                        ? "border-teal-500 ring-2 ring-teal-100"
                        : "border-slate-200 hover:border-teal-200"
                    } ${isDisabled ? "cursor-not-allowed opacity-60" : ""}`}
                    key={option.value}
                  >
                    <input
                      checked={isSelected}
                      className="mt-1 accent-teal-700"
                      disabled={isDisabled}
                      name="mood-audience"
                      onChange={() => handleAudienceChange(option.value)}
                      type="radio"
                    />
                    <span>
                      <span className="block text-sm font-bold text-slate-950">
                        {option.label}
                      </span>
                      <span className="mt-1 block text-sm leading-6 text-slate-600">
                        {option.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>

            {isLoadingFriends ? (
              <p className="mt-3 text-sm font-semibold text-slate-500">
                Loading friends...
              </p>
            ) : null}

            {friendError ? (
              <p className="mt-3 text-sm font-semibold text-rose-700">
                {friendError}
              </p>
            ) : null}

            {!isLoadingFriends && !friendError && !hasFriends ? (
              <p className="mt-3 text-sm font-semibold text-slate-500">
                Add accepted friends from Connections to share mood check-ins.
              </p>
            ) : null}

            {isLoadingCircles ? (
              <p className="mt-3 text-sm font-semibold text-slate-500">
                Loading circles...
              </p>
            ) : null}

            {circleError ? (
              <p className="mt-3 text-sm font-semibold text-rose-700">
                {circleError}
              </p>
            ) : null}

            {isChoosingFriends && hasFriends ? (
              <div className="mt-4">
                <p className="text-sm font-semibold text-slate-700">
                  Choose friends
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {friendUsernames.map((friendUsername) => {
                    const isSelected =
                      selectedFriendUsernames.includes(friendUsername);

                    return (
                      <label
                        className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm font-bold transition ${
                          isSelected
                            ? "border-teal-500 bg-teal-50 text-teal-900"
                            : "border-slate-200 bg-white text-slate-700 hover:border-teal-200"
                        }`}
                        key={friendUsername}
                      >
                        <input
                          checked={isSelected}
                          className="accent-teal-700"
                          onChange={() => toggleFriendSelection(friendUsername)}
                          type="checkbox"
                        />
                        @{friendUsername}
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {isChoosingCircles && hasCircles ? (
              <div className="mt-4">
                <p className="text-sm font-semibold text-slate-700">
                  Choose circles
                </p>
                <div className="mt-3 grid gap-2">
                  {circles.map((circle) => {
                    const isSelected = selectedCircleIds.includes(circle.id);

                    return (
                      <label
                        className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition ${
                          isSelected
                            ? "border-teal-500 bg-teal-50 text-teal-900"
                            : "border-slate-200 bg-white text-slate-700 hover:border-teal-200"
                        }`}
                        key={circle.id}
                      >
                        <input
                          checked={isSelected}
                          className="mt-1 accent-teal-700"
                          onChange={() => toggleCircleSelection(circle.id)}
                          type="checkbox"
                        />
                        <span>
                          <span className="block font-bold">{circle.name}</span>
                          <span className="mt-1 block font-semibold text-slate-500">
                            {circle.memberUsernames.length} members
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </fieldset>

          <label className="mt-5 block text-sm font-semibold text-slate-700">
            Want to add more context?
            <textarea
              className="mt-2 min-h-28 w-full resize-none rounded-md border border-slate-300 bg-white p-3 text-sm text-slate-900 outline-none focus:border-teal-500 focus:bg-white"
              maxLength={noteLimit}
              onChange={(event) => setNote(event.target.value)}
              placeholder="What happened, what you need, or anything you want to remember..."
              value={note}
            />
          </label>
          <div className="mt-1 text-right text-xs font-semibold text-slate-500">
            {note.length}/{noteLimit}
          </div>
        </div>
      ) : null}

      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link className="btn btn-secondary sm:min-w-32" href="/">
          Cancel
        </Link>
        <button
          className="btn btn-primary sm:min-w-40"
          disabled={!canSave}
          onClick={handleSave}
          type="button"
        >
          {isSaving
            ? "Saving..."
            : isAddingDetails
              ? "Save check-in"
              : "Save quick check-in"}
        </button>
      </div>

      {error ? (
        <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-900">
          {error}
        </p>
      ) : null}

      {savedCheckIn ? (
        <div className="mt-5 border-t border-slate-200 pt-4" role="status">
          <p className="text-sm font-bold text-slate-950">
            Check-in saved to your personal mood entries.
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Feeling {savedCheckIn.mood} at {savedCheckIn.intensity}/5. Support
            signal:
            {" " + savedCheckIn.supportNeed.toLowerCase()}.
          </p>
          {savedCheckIn.sharedCircleIds.length > 0 ? (
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Broadcast to{" "}
              {getCircleSharingTargetText(savedCheckIn.sharedCircleIds, circles)}
              .
            </p>
          ) : savedCheckIn.sharedWith.length > 0 ? (
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Shared with{" "}
              {savedCheckIn.sharedWith
                .map((friendUsername) => `@${friendUsername}`)
                .join(", ")}
              .
            </p>
          ) : null}
          <Link
            className="btn btn-secondary btn-sm mt-4"
            href="/mood/entries"
          >
            View my mood entries
          </Link>
        </div>
      ) : null}
    </section>
  );
}
