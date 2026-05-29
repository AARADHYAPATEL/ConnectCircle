"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type {
  BlockedConnection,
  ConnectionRelationship,
  ConnectionRequest,
  ConnectionSummary,
  Friendship,
} from "@/lib/connectionTypes";

type ConnectionsPanelProps = {
  username: string;
};

type RequestAction = "accept" | "decline" | "cancel";
type FriendAction = "remove" | "block" | "unblock" | "remove_block";

type UsernameSuggestion = {
  avatarImage: string;
  displayName: string;
  id: string;
  profileDetailsVisible: boolean;
  relationship: ConnectionRelationship;
  username: string;
};

type UsernameSuggestionResponse = {
  results: UsernameSuggestion[];
};

const emptySummary: ConnectionSummary = {
  incomingRequests: [],
  outgoingRequests: [],
  friends: [],
  blockedUsers: [],
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function getFriendUsername(friendship: Friendship, username: string) {
  return (
    friendship.usernames.find(
      (friendUsername) =>
        friendUsername.toLowerCase() !== username.toLowerCase(),
    ) ?? friendship.usernames[0]
  );
}

function getProfileHref(username: string) {
  return `/people/${encodeURIComponent(username)}`;
}

function getReportHref(username: string) {
  return `/people/${encodeURIComponent(username)}/report`;
}

function getRelationshipCopy(relationship: ConnectionRelationship) {
  switch (relationship) {
    case "blocked":
      return "Blocked";
    case "connected":
      return "Connected";
    case "incoming_request":
      return "Invitation received";
    case "none":
      return "Available";
    case "outgoing_request":
      return "Invitation pending";
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

async function readErrorMessage(response: Response) {
  try {
    const data: { error?: string } = await response.json();

    return data.error || "We could not complete this request.";
  } catch {
    return "We could not complete this request.";
  }
}

export function ConnectionsPanel({ username }: ConnectionsPanelProps) {
  const [summary, setSummary] = useState<ConnectionSummary>(emptySummary);
  const [targetUsername, setTargetUsername] = useState("");
  const [usernameSuggestions, setUsernameSuggestions] = useState<
    UsernameSuggestion[]
  >([]);
  const [isSuggestionListOpen, setIsSuggestionListOpen] = useState(false);
  const [isSuggestingUsernames, setIsSuggestingUsernames] = useState(false);
  const [usernameSuggestionError, setUsernameSuggestionError] = useState("");
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [respondingRequestId, setRespondingRequestId] = useState<string | null>(
    null,
  );
  const [managingUsername, setManagingUsername] = useState<string | null>(null);
  const [openFriendMenuId, setOpenFriendMenuId] = useState<string | null>(null);
  const [openBlockedMenuId, setOpenBlockedMenuId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const trimmedTargetUsername = targetUsername.trim();
  const canSuggestUsernames = trimmedTargetUsername.length > 0;
  const selectedSuggestion = usernameSuggestions.find(
    (suggestion) =>
      suggestion.username.toLowerCase() ===
      trimmedTargetUsername.toLowerCase(),
  );
  const canSendRequest =
    trimmedTargetUsername.length > 0 &&
    !isSending &&
    (!selectedSuggestion || selectedSuggestion.relationship === "none");
  const shouldShowUsernameSuggestions =
    isSuggestionListOpen && canSuggestUsernames;
  const sortedFriends = useMemo(
    () =>
      [...summary.friends].sort((first, second) =>
        getFriendUsername(first, username).localeCompare(
          getFriendUsername(second, username),
        ),
      ),
    [summary.friends, username],
  );
  const hasConnectionActivity =
    summary.incomingRequests.length > 0 ||
    summary.outgoingRequests.length > 0 ||
    sortedFriends.length > 0 ||
    summary.blockedUsers.length > 0;

  async function loadConnections() {
    const response = await fetch("/api/connections", {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Could not load connections.");
    }

    const data: ConnectionSummary = await response.json();
    setSummary(data);
  }

  useEffect(() => {
    let isActive = true;

    async function loadInitialConnections() {
      try {
        const response = await fetch("/api/connections", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Could not load connections.");
        }

        const data: ConnectionSummary = await response.json();

        if (isActive) {
          setSummary(data);
          setError("");
        }
      } catch {
        if (isActive) {
          setError("Connections could not be loaded.");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadInitialConnections();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!openFriendMenuId && !openBlockedMenuId) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;

      if (
        target instanceof Element &&
        target.closest("[data-connection-menu]")
      ) {
        return;
      }

      setOpenFriendMenuId(null);
      setOpenBlockedMenuId(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenFriendMenuId(null);
        setOpenBlockedMenuId(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openBlockedMenuId, openFriendMenuId]);

  useEffect(() => {
    if (!canSuggestUsernames || !isSuggestionListOpen) {
      return;
    }

    let isActive = true;
    const timeoutId = window.setTimeout(async () => {
      setIsSuggestingUsernames(true);
      setUsernameSuggestionError("");

      try {
        const response = await fetch(
          `/api/people/search?q=${encodeURIComponent(trimmedTargetUsername)}`,
          { cache: "no-store" },
        );

        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }

        const data: UsernameSuggestionResponse = await response.json();

        if (isActive) {
          setUsernameSuggestions(data.results.slice(0, 5));
          setActiveSuggestionIndex(-1);
        }
      } catch (suggestionError) {
        if (isActive) {
          setUsernameSuggestions([]);
          setUsernameSuggestionError(
            suggestionError instanceof Error
              ? suggestionError.message
              : "Username suggestions could not be loaded.",
          );
        }
      } finally {
        if (isActive) {
          setIsSuggestingUsernames(false);
        }
      }
    }, 160);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [canSuggestUsernames, isSuggestionListOpen, trimmedTargetUsername]);

  function handleSuggestionSelect(suggestion: UsernameSuggestion) {
    setTargetUsername(suggestion.username);
    setIsSuggestionListOpen(false);
    setActiveSuggestionIndex(-1);
    setError("");
    setSuccessMessage("");
  }

  async function handleSendRequest() {
    if (!canSendRequest) {
      return;
    }

    setIsSending(true);
    setError("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/connections/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username: trimmedTargetUsername }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      setTargetUsername("");
      setUsernameSuggestions([]);
      setIsSuggestionListOpen(false);
      setSuccessMessage(`Connection request sent to @${trimmedTargetUsername}.`);
      await loadConnections();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Connection request could not be sent.",
      );
    } finally {
      setIsSending(false);
    }
  }

  async function handleRespond(
    request: ConnectionRequest,
    action: RequestAction,
  ) {
    setRespondingRequestId(request.id);
    setError("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/connections/respond", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ requestId: request.id, action }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      setSuccessMessage(
        action === "accept"
          ? `You are now connected with @${request.fromUsername}.`
          : action === "decline"
            ? `Request from @${request.fromUsername} declined.`
            : `Invitation to @${request.toUsername} cancelled.`,
      );
      await loadConnections();
    } catch (responseError) {
      setError(
        responseError instanceof Error
          ? responseError.message
          : "Connection request could not be updated.",
      );
    } finally {
      setRespondingRequestId(null);
    }
  }

  async function handleFriendAction(
    targetUsername: string,
    action: FriendAction,
  ) {
    const actionLabel =
      action === "remove"
        ? "remove this friend"
        : action === "block"
          ? "block this friend"
          : action === "remove_block"
            ? "remove this user from the visible blocked list"
            : "unblock this user";
    const shouldContinue =
      action === "unblock" ||
      window.confirm(`Are you sure you want to ${actionLabel}?`);

    if (!shouldContinue) {
      return;
    }

    setManagingUsername(`${action}:${targetUsername}`);
    setError("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/connections/manage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username: targetUsername, action }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      setSuccessMessage(
        action === "remove"
          ? `Removed @${targetUsername} from your friends.`
          : action === "block"
            ? `Blocked @${targetUsername}.`
            : action === "remove_block"
              ? `Removed @${targetUsername} from your blocked users list. They are still blocked.`
              : `Unblocked @${targetUsername}.`,
      );
      await loadConnections();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Connection could not be updated.",
      );
    } finally {
      setManagingUsername(null);
    }
  }

  return (
    <section
      aria-labelledby="connections-title"
      className="mx-auto w-full max-w-5xl px-6 py-10"
    >
      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
        <div>
          <p className="text-sm font-semibold uppercase tracking-normal text-teal-700">
            Connections
          </p>
          <h1
            className="mt-2 text-4xl font-bold leading-tight text-slate-950"
            id="connections-title"
          >
            Manage friend requests and accepted connections.
          </h1>
          <p className="mt-4 leading-7 text-slate-700">
            Send requests by username, review invitations, and keep your
            ConnectCircle friends list intentional.
          </p>
        </div>

        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <label
            className="block text-sm font-semibold text-slate-800"
            htmlFor="connection-username"
          >
            Username
          </label>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <input
                aria-activedescendant={
                  activeSuggestionIndex >= 0
                    ? `connection-username-suggestion-${activeSuggestionIndex}`
                    : undefined
                }
                aria-autocomplete="list"
                aria-controls="connection-username-suggestions"
                aria-expanded={shouldShowUsernameSuggestions}
                className="min-h-12 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-3 text-base font-semibold text-slate-950 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-200"
                id="connection-username"
                onBlur={() => {
                  window.setTimeout(() => setIsSuggestionListOpen(false), 120);
                }}
                onChange={(event) => {
                  const nextTargetUsername = event.target.value;

                  setTargetUsername(nextTargetUsername);
                  setIsSuggestionListOpen(nextTargetUsername.trim().length > 0);
                  if (!nextTargetUsername.trim()) {
                    setUsernameSuggestions([]);
                    setIsSuggestingUsernames(false);
                    setUsernameSuggestionError("");
                    setActiveSuggestionIndex(-1);
                  }
                  setError("");
                  setSuccessMessage("");
                }}
                onFocus={() => {
                  if (trimmedTargetUsername.length > 0) {
                    setIsSuggestionListOpen(true);
                  }
                }}
                onKeyDown={(event) => {
                  if (
                    shouldShowUsernameSuggestions &&
                    usernameSuggestions.length > 0 &&
                    event.key === "ArrowDown"
                  ) {
                    event.preventDefault();
                    setActiveSuggestionIndex((currentIndex) =>
                      currentIndex + 1 >= usernameSuggestions.length
                        ? 0
                        : currentIndex + 1,
                    );
                    return;
                  }

                  if (
                    shouldShowUsernameSuggestions &&
                    usernameSuggestions.length > 0 &&
                    event.key === "ArrowUp"
                  ) {
                    event.preventDefault();
                    setActiveSuggestionIndex((currentIndex) =>
                      currentIndex <= 0
                        ? usernameSuggestions.length - 1
                        : currentIndex - 1,
                    );
                    return;
                  }

                  if (event.key === "Escape") {
                    setIsSuggestionListOpen(false);
                    setActiveSuggestionIndex(-1);
                    return;
                  }

                  if (event.key === "Enter") {
                    if (
                      shouldShowUsernameSuggestions &&
                      activeSuggestionIndex >= 0 &&
                      usernameSuggestions[activeSuggestionIndex]
                    ) {
                      event.preventDefault();
                      handleSuggestionSelect(
                        usernameSuggestions[activeSuggestionIndex],
                      );
                      return;
                    }

                    void handleSendRequest();
                  }
                }}
                placeholder="friend_username"
                role="combobox"
                value={targetUsername}
              />

              {shouldShowUsernameSuggestions ? (
                <div
                  className="absolute left-0 right-0 z-40 mt-2 overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl shadow-slate-950/10"
                  id="connection-username-suggestions"
                  role="listbox"
                >
                  {isSuggestingUsernames ? (
                    <p className="px-3 py-3 text-sm font-semibold text-slate-500">
                      Searching...
                    </p>
                  ) : null}

                  {!isSuggestingUsernames && usernameSuggestionError ? (
                    <p className="px-3 py-3 text-sm font-semibold text-rose-700">
                      {usernameSuggestionError}
                    </p>
                  ) : null}

                  {!isSuggestingUsernames &&
                  !usernameSuggestionError &&
                  usernameSuggestions.length === 0 ? (
                    <p className="px-3 py-3 text-sm font-semibold text-slate-500">
                      No matching usernames.
                    </p>
                  ) : null}

                  {usernameSuggestions.map((suggestion, suggestionIndex) => {
                    const isActive =
                      activeSuggestionIndex === suggestionIndex;
                    const avatarStyle =
                      suggestion.profileDetailsVisible &&
                      suggestion.avatarImage
                        ? {
                            backgroundImage: `url(${JSON.stringify(
                              suggestion.avatarImage,
                            )})`,
                          }
                        : undefined;

                    return (
                      <button
                        aria-selected={isActive}
                        className={`flex w-full items-center gap-3 px-3 py-3 text-left transition ${
                          isActive
                            ? "bg-teal-50 text-teal-950"
                            : "text-slate-950 hover:bg-slate-50"
                        }`}
                        id={`connection-username-suggestion-${suggestionIndex}`}
                        key={suggestion.id}
                        onClick={() => handleSuggestionSelect(suggestion)}
                        onMouseDown={(event) => event.preventDefault()}
                        role="option"
                        type="button"
                      >
                        <span
                          aria-hidden="true"
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-teal-200 bg-teal-50 bg-cover bg-center text-xs font-black text-teal-800"
                          style={avatarStyle}
                        >
                          {suggestion.profileDetailsVisible &&
                          suggestion.avatarImage
                            ? null
                            : getInitials(
                                suggestion.profileDetailsVisible
                                  ? suggestion.displayName
                                  : "",
                                suggestion.username,
                              )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold">
                            @{suggestion.username}
                          </span>
                          <span className="mt-0.5 block text-xs font-semibold text-slate-500">
                            {getRelationshipCopy(suggestion.relationship)}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <button
              className="btn btn-primary"
              disabled={!canSendRequest}
              onClick={() => void handleSendRequest()}
              type="button"
            >
              {isSending ? "Sending..." : "Send request"}
            </button>
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-500">
            Signed in as @{username}.
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

      {isLoading ? (
        <div className="mt-8 rounded-md border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-600">
          Loading connections...
        </div>
      ) : null}

      {!isLoading && !hasConnectionActivity ? <ConnectionEmptyGuide /> : null}

      {!isLoading && hasConnectionActivity ? (
        <div className="mt-8 grid gap-5 lg:grid-cols-2 xl:grid-cols-4">
          <ConnectionList title="Incoming requests">
            {summary.incomingRequests.length === 0 ? (
              <EmptyState text="New invitations from other users will appear here." />
            ) : (
              summary.incomingRequests.map((request) => (
                <article
                  className="rounded-md border border-slate-200 bg-white p-4 shadow-sm"
                  key={request.id}
                >
                  <Link
                    className="inline-block max-w-full truncate text-lg font-bold text-slate-950 transition hover:text-teal-700 focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200"
                    href={getProfileHref(request.fromUsername)}
                  >
                    @{request.fromUsername}
                  </Link>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    Sent {formatDate(request.createdAt)}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={respondingRequestId === request.id}
                      onClick={() => void handleRespond(request, "accept")}
                      type="button"
                    >
                      Accept
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={respondingRequestId === request.id}
                      onClick={() => void handleRespond(request, "decline")}
                      type="button"
                    >
                      Decline
                    </button>
                  </div>
                </article>
              ))
            )}
          </ConnectionList>

          <ConnectionList title="Sent invitations">
            {summary.outgoingRequests.length === 0 ? (
              <EmptyState text="Invitations you send will stay here until accepted." />
            ) : (
              summary.outgoingRequests.map((request) => (
                <SentInvitationCard
                  isCancelling={respondingRequestId === request.id}
                  key={request.id}
                  onCancel={() => void handleRespond(request, "cancel")}
                  request={request}
                />
              ))
            )}
          </ConnectionList>

          <ConnectionList title="Friends">
            {sortedFriends.length === 0 ? (
              <EmptyState text="Accepted connections will become your friends." />
            ) : (
              sortedFriends.map((friendship) => {
                const friendUsername = getFriendUsername(friendship, username);
                const isFriendMenuOpen = openFriendMenuId === friendship.id;

                return (
                  <article
                    className={`relative overflow-visible rounded-md border border-teal-200 bg-teal-50 p-4 shadow-sm ${
                      isFriendMenuOpen
                        ? "z-50"
                        : "z-0 focus-within:z-30 hover:z-30"
                    }`}
                    key={friendship.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          className="block truncate text-lg font-bold text-slate-950 transition hover:text-teal-700 focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200"
                          href={getProfileHref(friendUsername)}
                        >
                          @{friendUsername}
                        </Link>
                        <p className="mt-1 text-sm font-semibold text-teal-800">
                          Connected {formatDate(friendship.createdAt)}
                        </p>
                      </div>
                      <div className="relative shrink-0" data-connection-menu>
                        <button
                          aria-expanded={isFriendMenuOpen}
                          aria-haspopup="menu"
                          aria-label={`More actions for ${friendUsername}`}
                          className="grid h-9 w-9 cursor-pointer list-none place-items-center rounded-md border border-teal-200 bg-white/70 text-xl font-black leading-none text-slate-500 transition hover:border-teal-400 hover:text-slate-950 dark:border-teal-500/35 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:text-white"
                          onClick={() => {
                            setOpenBlockedMenuId(null);
                            setOpenFriendMenuId((currentMenuId) =>
                              currentMenuId === friendship.id
                                ? null
                                : friendship.id,
                            );
                          }}
                          type="button"
                        >
                          ...
                        </button>
                        {isFriendMenuOpen ? (
                          <div
                            className="absolute right-0 z-50 mt-2 grid min-w-36 gap-1 rounded-md border border-slate-200 bg-white p-2 shadow-xl shadow-slate-950/10 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30"
                            role="menu"
                          >
                            <button
                              className="rounded-md border border-transparent px-3 py-2 text-left text-sm font-bold text-slate-700 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-950 focus-visible:border-teal-300 focus-visible:bg-teal-50 focus-visible:text-teal-950 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-teal-300 active:bg-teal-100 dark:text-slate-200 dark:hover:border-teal-400 dark:hover:bg-teal-950/50 dark:hover:text-teal-50 dark:focus-visible:border-teal-400 dark:focus-visible:bg-teal-950/50 dark:focus-visible:text-teal-50 dark:focus-visible:outline-teal-400"
                              disabled={
                                managingUsername === `remove:${friendUsername}`
                              }
                              onClick={() => {
                                setOpenFriendMenuId(null);
                                void handleFriendAction(
                                  friendUsername,
                                  "remove",
                                );
                              }}
                              role="menuitem"
                              type="button"
                            >
                              Remove
                            </button>
                            <Link
                              className="rounded-md px-3 py-2 text-left text-sm font-bold text-rose-700 transition hover:bg-rose-50 hover:text-rose-900 focus-visible:bg-rose-50 focus-visible:text-rose-900 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-rose-300 dark:text-rose-200 dark:hover:bg-rose-950/40 dark:hover:text-rose-100 dark:focus-visible:bg-rose-950/40 dark:focus-visible:text-rose-100 dark:focus-visible:outline-rose-400"
                              href={getReportHref(friendUsername)}
                              onClick={() => setOpenFriendMenuId(null)}
                              role="menuitem"
                            >
                              Report
                            </Link>
                            <button
                              className="rounded-md px-3 py-2 text-left text-sm font-bold text-rose-700 transition hover:bg-rose-50 hover:text-rose-900 dark:text-rose-200 dark:hover:bg-rose-950/40 dark:hover:text-rose-100"
                              disabled={
                                managingUsername === `block:${friendUsername}`
                              }
                              onClick={() => {
                                setOpenFriendMenuId(null);
                                void handleFriendAction(
                                  friendUsername,
                                  "block",
                                );
                              }}
                              role="menuitem"
                              type="button"
                            >
                              Block
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </ConnectionList>

          <ConnectionList title="Blocked users">
            {summary.blockedUsers.length === 0 ? (
              <EmptyState text="Blocked users will appear here so you can unblock them later." />
            ) : (
              summary.blockedUsers.map((block) => (
                <BlockedUserCard
                  block={block}
                  isManaging={
                    managingUsername === `unblock:${block.blockedUsername}`
                  }
                  isMenuOpen={openBlockedMenuId === block.id}
                  key={block.id}
                  onCloseMenu={() => setOpenBlockedMenuId(null)}
                  onToggleMenu={() => {
                    setOpenFriendMenuId(null);
                    setOpenBlockedMenuId((currentMenuId) =>
                      currentMenuId === block.id ? null : block.id,
                    );
                  }}
                  onRemoveBlock={() =>
                    void handleFriendAction(
                      block.blockedUsername,
                      "remove_block",
                    )
                  }
                  onUnblock={() =>
                    void handleFriendAction(block.blockedUsername, "unblock")
                  }
                />
              ))
            )}
          </ConnectionList>
        </div>
      ) : null}
    </section>
  );
}

function ConnectionEmptyGuide() {
  return (
    <section className="mt-8 rounded-md border border-dashed border-teal-300 bg-teal-50 p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-normal text-teal-800">
        First connection
      </p>
      <h2 className="mt-2 text-2xl font-bold text-slate-950">
        Start with one trusted connection.
      </h2>
      <p className="mt-3 max-w-2xl leading-7 text-slate-700">
        Send a username request. Once it is accepted, that person becomes
        available for chat, circles, and shared support.
      </p>
      <a className="btn btn-primary mt-5" href="#connection-username">
        Enter username
      </a>
    </section>
  );
}

function BlockedUserCard({
  block,
  isManaging,
  isMenuOpen,
  onCloseMenu,
  onRemoveBlock,
  onToggleMenu,
  onUnblock,
}: {
  block: BlockedConnection;
  isManaging: boolean;
  isMenuOpen: boolean;
  onCloseMenu: () => void;
  onRemoveBlock: () => void;
  onToggleMenu: () => void;
  onUnblock: () => void;
}) {
  return (
    <article
      className={`relative overflow-visible rounded-md border border-rose-200 bg-rose-50 p-4 shadow-sm ${
        isMenuOpen ? "z-50" : "z-0 focus-within:z-30 hover:z-30"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            className="block truncate text-lg font-bold text-slate-950 transition hover:text-rose-800 focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
            href={getProfileHref(block.blockedUsername)}
          >
            @{block.blockedUsername}
          </Link>
          <p className="mt-1 text-sm font-semibold text-rose-800">
            Blocked {formatDate(block.createdAt)}
          </p>
        </div>
        <div className="relative shrink-0" data-connection-menu>
          <button
            aria-expanded={isMenuOpen}
            aria-haspopup="menu"
            aria-label={`More actions for ${block.blockedUsername}`}
            className="grid h-9 w-9 cursor-pointer list-none place-items-center rounded-md border border-rose-200 bg-white/70 text-xl font-black leading-none text-slate-500 transition hover:border-rose-400 hover:text-slate-950 dark:border-rose-500/35 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:text-white"
            onClick={onToggleMenu}
            type="button"
          >
            ...
          </button>
          {isMenuOpen ? (
            <div
              className="absolute right-0 z-50 mt-2 grid min-w-36 gap-1 rounded-md border border-slate-200 bg-white p-2 shadow-xl shadow-slate-950/10 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30"
              role="menu"
            >
              <button
                className="rounded-md border border-transparent px-3 py-2 text-left text-sm font-bold text-slate-700 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-950 focus-visible:border-teal-300 focus-visible:bg-teal-50 focus-visible:text-teal-950 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-teal-300 active:bg-teal-100 dark:text-slate-200 dark:hover:border-teal-400 dark:hover:bg-teal-950/50 dark:hover:text-teal-50 dark:focus-visible:border-teal-400 dark:focus-visible:bg-teal-950/50 dark:focus-visible:text-teal-50 dark:focus-visible:outline-teal-400"
                disabled={isManaging}
                onClick={() => {
                  onCloseMenu();
                  onUnblock();
                }}
                role="menuitem"
                type="button"
              >
                Unblock
              </button>
              <button
                className="rounded-md px-3 py-2 text-left text-sm font-bold text-rose-700 transition hover:bg-rose-50 hover:text-rose-900 focus-visible:bg-rose-50 focus-visible:text-rose-900 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-rose-300 dark:text-rose-200 dark:hover:bg-rose-950/40 dark:hover:text-rose-100 dark:focus-visible:bg-rose-950/40 dark:focus-visible:text-rose-100 dark:focus-visible:outline-rose-400"
                disabled={isManaging}
                onClick={() => {
                  onCloseMenu();
                  onRemoveBlock();
                }}
                role="menuitem"
                type="button"
              >
                Remove
              </button>
              <Link
                className="rounded-md px-3 py-2 text-left text-sm font-bold text-rose-700 transition hover:bg-rose-50 hover:text-rose-900 focus-visible:bg-rose-50 focus-visible:text-rose-900 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-rose-300 dark:text-rose-200 dark:hover:bg-rose-950/40 dark:hover:text-rose-100 dark:focus-visible:bg-rose-950/40 dark:focus-visible:text-rose-100 dark:focus-visible:outline-rose-400"
                href={getReportHref(block.blockedUsername)}
                onClick={onCloseMenu}
                role="menuitem"
              >
                Report
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function SentInvitationCard({
  isCancelling,
  onCancel,
  request,
}: {
  isCancelling: boolean;
  onCancel: () => void;
  request: ConnectionRequest;
}) {
  return (
    <article className="rounded-md border border-amber-200 bg-gradient-to-br from-white via-white to-amber-50/70 p-4 shadow-sm shadow-amber-950/5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-amber-200 bg-amber-50 text-sm font-black text-amber-900"
        >
          {getInitials("", request.toUsername)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              className="min-w-0 truncate text-lg font-bold text-slate-950 transition hover:text-teal-700 focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200"
              href={getProfileHref(request.toUsername)}
            >
              @{request.toUsername}
            </Link>
            <span className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs font-black uppercase tracking-normal text-amber-800">
              Pending
            </span>
          </div>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            Sent {formatDate(request.createdAt)}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-md border border-amber-100 bg-white/80 p-3">
        <p className="text-xs font-black uppercase tracking-normal text-amber-800">
          Waiting for response
        </p>
        <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
          This invitation will move into Friends after they accept.
        </p>
      </div>

      <button
        className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-800 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-rose-300 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
        disabled={isCancelling}
        onClick={onCancel}
        type="button"
      >
        {isCancelling ? "Cancelling..." : "Cancel invitation"}
      </button>
    </article>
  );
}

function ConnectionList({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section>
      <h2 className="text-xl font-bold text-slate-950">{title}</h2>
      <div className="mt-4 grid gap-3">{children}</div>
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-white p-4">
      <p className="text-sm font-semibold leading-6 text-slate-600">{text}</p>
    </div>
  );
}
