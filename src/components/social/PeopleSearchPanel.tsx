"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type PeopleSearchRelationship =
  | "blocked"
  | "connected"
  | "incoming_request"
  | "none"
  | "outgoing_request";

type PeopleSearchResult = {
  avatarImage: string;
  displayName: string;
  id: string;
  profileDetailsVisible: boolean;
  username: string;
  relationship: PeopleSearchRelationship;
};

type PeopleSearchResponse = {
  results: PeopleSearchResult[];
};

type PeopleSearchPanelProps = {
  initialQuery?: string;
};

function PersonPlusIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M15 19.5c-.8-2-2.7-3.5-5-3.5s-4.2 1.5-5 3.5M10 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM18 8v6M21 11h-6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

async function readErrorMessage(response: Response) {
  try {
    const data: { error?: string } = await response.json();

    return data.error || "We could not complete this request.";
  } catch {
    return "We could not complete this request.";
  }
}

function getRelationshipCopy(relationship: PeopleSearchRelationship) {
  switch (relationship) {
    case "blocked":
      return "Blocked";
    case "connected":
      return "Connected";
    case "incoming_request":
      return "Invitation received";
    case "outgoing_request":
      return "Invitation pending";
    case "none":
      return "Available";
  }
}

function getInitials(displayName: string, username: string) {
  const words = (displayName || username)
    .split(/[\s_]+/)
    .filter(Boolean)
    .slice(0, 2);
  const initials = words.map((word) => word[0]?.toUpperCase()).join("");

  return initials || username[0]?.toUpperCase() || "C";
}

function getProfileHref(username: string) {
  return `/people/${encodeURIComponent(username)}`;
}

export function PeopleSearchPanel({ initialQuery = "" }: PeopleSearchPanelProps) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<PeopleSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [connectingUsername, setConnectingUsername] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const trimmedQuery = query.trim();
  const canSearch = trimmedQuery.length >= 2;
  const displayedResults = canSearch ? results : [];

  useEffect(() => {
    if (!canSearch) {
      return;
    }

    let isActive = true;
    const timeoutId = window.setTimeout(async () => {
      setIsSearching(true);
      setError("");

      try {
        const response = await fetch(
          `/api/people/search?q=${encodeURIComponent(trimmedQuery)}`,
          { cache: "no-store" },
        );

        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }

        const data: PeopleSearchResponse = await response.json();

        if (isActive) {
          setResults(data.results);
        }
      } catch (searchError) {
        if (isActive) {
          setError(
            searchError instanceof Error
              ? searchError.message
              : "People search could not be loaded.",
          );
        }
      } finally {
        if (isActive) {
          setIsSearching(false);
        }
      }
    }, 180);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [canSearch, trimmedQuery]);

  async function refreshSearch() {
    if (!canSearch) {
      return;
    }

    const response = await fetch(
      `/api/people/search?q=${encodeURIComponent(trimmedQuery)}`,
      { cache: "no-store" },
    );

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    const data: PeopleSearchResponse = await response.json();
    setResults(data.results);
  }

  async function handleConnect(username: string) {
    setConnectingUsername(username);
    setError("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/connections/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      setSuccessMessage(`Connection request sent to @${username}.`);
      await refreshSearch();
    } catch (connectError) {
      setError(
        connectError instanceof Error
          ? connectError.message
          : "Connection request could not be sent.",
      );
    } finally {
      setConnectingUsername("");
    }
  }

  return (
    <section
      aria-labelledby="people-search-title"
      className="mx-auto w-full max-w-5xl px-6 py-10"
    >
      <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
        <div>
          <p className="text-sm font-semibold uppercase tracking-normal text-teal-700">
            People search
          </p>
          <h1
            className="mt-2 text-4xl font-bold leading-tight text-slate-950"
            id="people-search-title"
          >
            Find people by username.
          </h1>
          <p className="mt-4 leading-7 text-slate-700">
            Search for an exact or partial username, then send an invitation
            when you find the right account.
          </p>
        </div>

        <div className="motion-panel rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <label
            className="block text-sm font-semibold text-slate-800"
            htmlFor="people-search"
          >
            Username
          </label>
          <input
            className="mt-3 min-h-12 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-3 text-base font-semibold text-slate-950 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-200"
            id="people-search"
            onChange={(event) => {
              const nextQuery = event.target.value;

              setQuery(nextQuery);
              if (nextQuery.trim().length < 2) {
                setResults([]);
                setIsSearching(false);
              }
              setError("");
              setSuccessMessage("");
            }}
            placeholder="Type at least 2 letters, such as aara"
            value={query}
          />
          <p className="mt-3 text-sm font-semibold text-slate-500">
            Results update automatically as you type.
          </p>

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
        </div>
      </div>

      <div className="mt-8 rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4">
          <h2 className="text-xl font-bold text-slate-950">Search results</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            {canSearch
              ? isSearching
                ? "Searching..."
                : `${displayedResults.length} matching ${
                    displayedResults.length === 1 ? "person" : "people"
                  }`
              : "Type at least two letters to begin."}
          </p>
        </div>

        {!canSearch ? (
          <div className="p-5">
            <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-5">
              <p className="text-sm font-semibold leading-6 text-slate-600">
                Search using the first few letters of a username. For example,
                typing aara can surface aaradhyap.
              </p>
            </div>
          </div>
        ) : null}

        {canSearch && !isSearching && displayedResults.length === 0 ? (
          <div className="p-5">
            <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-5">
              <p className="text-sm font-semibold leading-6 text-slate-600">
                No matching users found. Check the spelling or ask for
                their exact username.
              </p>
            </div>
          </div>
        ) : null}

        {displayedResults.length > 0 ? (
          <div className="divide-y divide-slate-200">
            {displayedResults.map((person) => (
              <article
                className="flex flex-wrap items-center justify-between gap-3 p-4"
                key={person.id}
              >
                <Link
                  className="flex min-w-0 items-center gap-3 rounded-md outline-none transition hover:text-teal-700 focus-visible:ring-2 focus-visible:ring-teal-200"
                  href={getProfileHref(person.username)}
                >
                  <PersonAvatar person={person} />
                  <div className="min-w-0">
                    <p className="truncate text-lg font-bold text-slate-950">
                      {person.profileDetailsVisible
                        ? person.displayName
                        : `@${person.username}`}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-500">
                      {person.profileDetailsVisible
                        ? `@${person.username} · ${getRelationshipCopy(
                            person.relationship,
                          )}`
                      : getRelationshipCopy(person.relationship)}
                    </p>
                  </div>
                </Link>
                <PersonSearchAction
                  isConnecting={connectingUsername === person.username}
                  onConnect={() => void handleConnect(person.username)}
                  person={person}
                />
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PersonAvatar({ person }: { person: PeopleSearchResult }) {
  const avatarStyle =
    person.profileDetailsVisible && person.avatarImage
      ? { backgroundImage: `url(${JSON.stringify(person.avatarImage)})` }
      : undefined;

  return (
    <div
      aria-hidden="true"
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-teal-200 bg-teal-50 bg-cover bg-center text-sm font-black text-teal-800"
      style={avatarStyle}
    >
      {person.profileDetailsVisible && person.avatarImage
        ? null
        : getInitials(
            person.profileDetailsVisible ? person.displayName : "",
            person.username,
          )}
    </div>
  );
}

function PersonSearchAction({
  isConnecting,
  onConnect,
  person,
}: {
  isConnecting: boolean;
  onConnect: () => void;
  person: PeopleSearchResult;
}) {
  if (person.relationship === "incoming_request") {
    return (
      <Link className="btn btn-secondary btn-sm" href="/social/connections">
        Review invitation
      </Link>
    );
  }

  if (person.relationship !== "none") {
    return (
      <button className="btn btn-secondary btn-sm" disabled type="button">
        {getRelationshipCopy(person.relationship)}
      </button>
    );
  }

  return (
    <button
      aria-label={`Invite ${person.username}`}
      className="btn btn-primary btn-sm gap-2"
      disabled={isConnecting}
      onClick={onConnect}
      type="button"
    >
      <PersonPlusIcon />
      {isConnecting ? "Sending..." : "Invite"}
    </button>
  );
}
