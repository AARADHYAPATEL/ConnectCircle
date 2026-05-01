"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type {
  BlockedConnection,
  ConnectionRequest,
  ConnectionSummary,
  Friendship,
} from "@/lib/connectionTypes";

type ConnectionsPanelProps = {
  username: string;
};

type RequestAction = "accept" | "decline";
type FriendAction = "remove" | "block" | "unblock";

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

async function readErrorMessage(response: Response) {
  try {
    const data: { error?: string } = await response.json();

    return data.error || "Something went wrong.";
  } catch {
    return "Something went wrong.";
  }
}

export function ConnectionsPanel({ username }: ConnectionsPanelProps) {
  const [summary, setSummary] = useState<ConnectionSummary>(emptySummary);
  const [targetUsername, setTargetUsername] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [respondingRequestId, setRespondingRequestId] = useState<string | null>(
    null,
  );
  const [managingUsername, setManagingUsername] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const trimmedTargetUsername = targetUsername.trim();
  const canSendRequest = trimmedTargetUsername.length > 0 && !isSending;
  const sortedFriends = useMemo(
    () =>
      [...summary.friends].sort((first, second) =>
        getFriendUsername(first, username).localeCompare(
          getFriendUsername(second, username),
        ),
      ),
    [summary.friends, username],
  );

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
          : `Request from @${request.fromUsername} declined.`,
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
            Social circle
          </p>
          <h1
            className="mt-2 text-4xl font-bold leading-tight text-slate-950"
            id="connections-title"
          >
            Build your circle with username requests.
          </h1>
          <p className="mt-4 leading-7 text-slate-700">
            Search by username, send a request, and wait for the other student
            to accept before they become part of your ConnectCircle friends.
          </p>
        </div>

        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <label
            className="block text-sm font-semibold text-slate-800"
            htmlFor="connection-username"
          >
            Friend username
          </label>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              className="min-h-12 flex-1 rounded-md border border-slate-300 bg-slate-50 px-3 py-3 text-base font-semibold text-slate-950 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-200"
              id="connection-username"
              onChange={(event) => {
                setTargetUsername(event.target.value);
                setError("");
                setSuccessMessage("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void handleSendRequest();
                }
              }}
              placeholder="friend_username"
              value={targetUsername}
            />
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
            Your username is @{username}.
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

      {!isLoading ? (
        <div className="mt-8 grid gap-5 lg:grid-cols-2 xl:grid-cols-4">
          <ConnectionList title="Incoming requests">
            {summary.incomingRequests.length === 0 ? (
              <EmptyState text="New requests from other users will appear here." />
            ) : (
              summary.incomingRequests.map((request) => (
                <article
                  className="rounded-md border border-slate-200 bg-white p-4 shadow-sm"
                  key={request.id}
                >
                  <p className="text-lg font-bold text-slate-950">
                    @{request.fromUsername}
                  </p>
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

          <ConnectionList title="Sent requests">
            {summary.outgoingRequests.length === 0 ? (
              <EmptyState text="Requests you send will stay here until accepted." />
            ) : (
              summary.outgoingRequests.map((request) => (
                <article
                  className="rounded-md border border-slate-200 bg-white p-4 shadow-sm"
                  key={request.id}
                >
                  <p className="text-lg font-bold text-slate-950">
                    @{request.toUsername}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    Waiting since {formatDate(request.createdAt)}
                  </p>
                  <span className="mt-4 inline-flex rounded-md bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
                    Pending
                  </span>
                </article>
              ))
            )}
          </ConnectionList>

          <ConnectionList title="Friends">
            {sortedFriends.length === 0 ? (
              <EmptyState text="Accepted connections will become your friends." />
            ) : (
              sortedFriends.map((friendship) => {
                const friendUsername = getFriendUsername(friendship, username);

                return (
                  <article
                    className="rounded-md border border-teal-200 bg-teal-50 p-4 shadow-sm"
                    key={friendship.id}
                  >
                    <p className="text-lg font-bold text-slate-950">
                      @{friendUsername}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-teal-800">
                      Connected {formatDate(friendship.createdAt)}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={managingUsername === `remove:${friendUsername}`}
                        onClick={() =>
                          void handleFriendAction(friendUsername, "remove")
                        }
                        type="button"
                      >
                        Remove
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        disabled={managingUsername === `block:${friendUsername}`}
                        onClick={() =>
                          void handleFriendAction(friendUsername, "block")
                        }
                        type="button"
                      >
                        Block
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </ConnectionList>

          <ConnectionList title="Blocked users">
            {summary.blockedUsers.length === 0 ? (
              <EmptyState text="Users you block will appear here so you can unblock them later." />
            ) : (
              summary.blockedUsers.map((block) => (
                <BlockedUserCard
                  block={block}
                  isManaging={
                    managingUsername === `unblock:${block.blockedUsername}`
                  }
                  key={block.id}
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

function BlockedUserCard({
  block,
  isManaging,
  onUnblock,
}: {
  block: BlockedConnection;
  isManaging: boolean;
  onUnblock: () => void;
}) {
  return (
    <article className="rounded-md border border-rose-200 bg-rose-50 p-4 shadow-sm">
      <p className="text-lg font-bold text-slate-950">
        @{block.blockedUsername}
      </p>
      <p className="mt-1 text-sm font-semibold text-rose-800">
        Blocked {formatDate(block.createdAt)}
      </p>
      <button
        className="btn btn-secondary btn-sm mt-4"
        disabled={isManaging}
        onClick={onUnblock}
        type="button"
      >
        Unblock
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
