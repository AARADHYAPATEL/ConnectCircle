"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  circleDescriptionLimit,
  circleNameLimit,
  type Circle,
  type CircleJoinRequestWithCircle,
  type CircleSummary,
} from "@/lib/circleTypes";
import type { ConnectionSummary, Friendship } from "@/lib/connectionTypes";

type CirclesPanelProps = {
  username: string;
};

type CircleAction = "delete" | "leave";
type JoinRequestAction = "accept" | "decline";

type CirclesPageData = {
  friendUsernames: string[];
  summary: CircleSummary;
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

async function fetchCirclesPageData(
  username: string,
): Promise<CirclesPageData> {
  const [circlesResponse, connectionsResponse] = await Promise.all([
    fetch("/api/circles", { cache: "no-store" }),
    fetch("/api/connections", { cache: "no-store" }),
  ]);

  if (!circlesResponse.ok || !connectionsResponse.ok) {
    throw new Error("Could not load circles.");
  }

  const summary: CircleSummary = await circlesResponse.json();
  const connectionsData: ConnectionSummary = await connectionsResponse.json();
  const friendUsernames = connectionsData.friends
    .map((friendship) => getFriendUsername(friendship, username))
    .filter(Boolean)
    .sort((first, second) => first.localeCompare(second));

  return {
    friendUsernames,
    summary,
  };
}

export function CirclesPanel({ username }: CirclesPanelProps) {
  const [circles, setCircles] = useState<Circle[]>([]);
  const [discoverableCircles, setDiscoverableCircles] = useState<Circle[]>([]);
  const [incomingJoinRequests, setIncomingJoinRequests] = useState<
    CircleJoinRequestWithCircle[]
  >([]);
  const [outgoingJoinRequests, setOutgoingJoinRequests] = useState<
    CircleJoinRequestWithCircle[]
  >([]);
  const [friendUsernames, setFriendUsernames] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [joinCircleName, setJoinCircleName] = useState("");
  const [selectedFriendUsernames, setSelectedFriendUsernames] = useState<
    string[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isRequestingByName, setIsRequestingByName] = useState(false);
  const [mutatingCircleAction, setMutatingCircleAction] = useState("");
  const [mutatingRequestId, setMutatingRequestId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const trimmedName = name.trim();
  const trimmedJoinCircleName = joinCircleName.trim();
  const hasFriends = friendUsernames.length > 0;
  const hasCircleActivity =
    circles.length > 0 ||
    discoverableCircles.length > 0 ||
    incomingJoinRequests.length > 0 ||
    outgoingJoinRequests.length > 0;
  const canCreate =
    trimmedName.length >= 2 &&
    trimmedName.length <= circleNameLimit &&
    description.trim().length <= circleDescriptionLimit &&
    selectedFriendUsernames.length > 0 &&
    !isCreating;
  const canRequestByName =
    trimmedJoinCircleName.length >= 2 && !isRequestingByName;

  function applyCirclesPageData(data: CirclesPageData) {
    setCircles(data.summary.circles);
    setDiscoverableCircles(data.summary.discoverableCircles);
    setIncomingJoinRequests(data.summary.incomingJoinRequests);
    setOutgoingJoinRequests(data.summary.outgoingJoinRequests);
    setFriendUsernames(data.friendUsernames);
  }

  async function refreshCirclesPage() {
    const data = await fetchCirclesPageData(username);
    applyCirclesPageData(data);
    setError("");
  }

  useEffect(() => {
    let isActive = true;

    async function loadCirclesPage() {
      try {
        const data = await fetchCirclesPageData(username);

        if (isActive) {
          applyCirclesPageData(data);
          setError("");
        }
      } catch {
        if (isActive) {
          setError("Circles could not be loaded right now.");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadCirclesPage();

    return () => {
      isActive = false;
    };
  }, [username]);

  function toggleFriendSelection(friendUsername: string) {
    setSelectedFriendUsernames((currentFriendUsernames) =>
      currentFriendUsernames.includes(friendUsername)
        ? currentFriendUsernames.filter(
            (currentFriendUsername) =>
              currentFriendUsername !== friendUsername,
          )
        : [...currentFriendUsernames, friendUsername],
    );
    setSuccessMessage("");
  }

  async function handleCreateCircle() {
    if (!canCreate) {
      return;
    }

    setIsCreating(true);
    setError("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/circles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          description: description.trim(),
          memberUsernames: selectedFriendUsernames,
          name: trimmedName,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const data: { circle: Circle } = await response.json();

      setName("");
      setDescription("");
      setSelectedFriendUsernames([]);
      setSuccessMessage(`${data.circle.name} is ready.`);
      await refreshCirclesPage();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Circle could not be created.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function handleCircleAction(circle: Circle, action: CircleAction) {
    const isDeleting = action === "delete";
    const shouldContinue = window.confirm(
      isDeleting
        ? `Delete ${circle.name}? This removes every member and CircleChat message.`
        : `Leave ${circle.name}? It will disappear from your circles.`,
    );

    if (!shouldContinue) {
      return;
    }

    setMutatingCircleAction(`${action}:${circle.id}`);
    setError("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/circles/manage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          circleId: circle.id,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      setSuccessMessage(
        isDeleting ? `${circle.name} was deleted.` : `You left ${circle.name}.`,
      );
      await refreshCirclesPage();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Circle could not be updated.",
      );
    } finally {
      setMutatingCircleAction("");
    }
  }

  async function handleRequestJoin(circle: Circle) {
    setMutatingCircleAction(`request:${circle.id}`);
    setError("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/circles/join-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "request",
          circleId: circle.id,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      setSuccessMessage(`Join request sent to @${circle.ownerUsername}.`);
      await refreshCirclesPage();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Join request could not be sent.",
      );
    } finally {
      setMutatingCircleAction("");
    }
  }

  async function handleRequestJoinByName() {
    if (!canRequestByName) {
      return;
    }

    setIsRequestingByName(true);
    setError("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/circles/join-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "request",
          circleName: trimmedJoinCircleName,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const data: { circle: Circle } = await response.json();

      setJoinCircleName("");
      setSuccessMessage(`Join request sent to @${data.circle.ownerUsername}.`);
      await refreshCirclesPage();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Join request could not be sent.",
      );
    } finally {
      setIsRequestingByName(false);
    }
  }

  async function handleRespondJoinRequest(
    request: CircleJoinRequestWithCircle,
    action: JoinRequestAction,
  ) {
    setMutatingRequestId(request.id);
    setError("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/circles/join-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          requestId: request.id,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      setSuccessMessage(
        action === "accept"
          ? `@${request.fromUsername} joined ${request.circle.name}.`
          : `Request from @${request.fromUsername} declined.`,
      );
      await refreshCirclesPage();
    } catch (responseError) {
      setError(
        responseError instanceof Error
          ? responseError.message
          : "Join request could not be updated.",
      );
    } finally {
      setMutatingRequestId(null);
    }
  }

  return (
    <section
      aria-labelledby="circles-title"
      className="mx-auto w-full max-w-6xl px-6 py-10"
    >
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-normal text-teal-700">
            Circles
          </p>
          <h1
            className="mt-2 text-4xl font-bold leading-tight text-slate-950"
            id="circles-title"
          >
            Create closer friend groups.
          </h1>
          <p className="mt-3 max-w-2xl leading-7 text-slate-700">
            Circles let you share check-ins with a group, manage who belongs,
            and automatically open a CircleChat for everyone inside it.
          </p>
        </div>
      </div>

      {error ? (
        <p className="mb-5 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900">
          {error}
        </p>
      ) : null}

      {successMessage ? (
        <p className="mb-5 rounded-md border border-teal-200 bg-teal-50 p-4 text-sm font-semibold text-teal-900">
          {successMessage}
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div
          className="motion-panel rounded-md border border-slate-200 bg-white p-5 shadow-sm"
          id="new-circle"
        >
          <h2 className="text-xl font-bold text-slate-950">New circle</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Choose accepted friends, name the circle, and its shared room opens
            with it.
          </p>

          <label className="mt-5 block text-sm font-semibold text-slate-700">
            Circle name
            <input
              className="mt-2 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-100"
              maxLength={circleNameLimit}
              onChange={(event) => {
                setName(event.target.value);
                setSuccessMessage("");
              }}
              placeholder="Study support, close friends..."
              value={name}
            />
          </label>
          <p className="mt-1 text-right text-xs font-semibold text-slate-500">
            {name.length}/{circleNameLimit}
          </p>

          <label className="mt-4 block text-sm font-semibold text-slate-700">
            Description
            <textarea
              className="mt-2 min-h-24 w-full resize-none rounded-md border border-slate-300 bg-slate-50 p-3 text-sm text-slate-900 outline-none focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-100"
              maxLength={circleDescriptionLimit}
              onChange={(event) => {
                setDescription(event.target.value);
                setSuccessMessage("");
              }}
              placeholder="What this circle is for..."
              value={description}
            />
          </label>
          <p className="mt-1 text-right text-xs font-semibold text-slate-500">
            {description.length}/{circleDescriptionLimit}
          </p>

          <fieldset className="mt-5">
            <legend className="text-sm font-semibold text-slate-700">
              Add friends
            </legend>

            {isLoading ? (
              <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-500">
                Loading friends...
              </p>
            ) : null}

            {!isLoading && !hasFriends ? (
              <p className="mt-3 rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-600">
                Add accepted friends from Connections before creating a circle.
              </p>
            ) : null}

            {hasFriends ? (
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
            ) : null}
          </fieldset>

          <button
            className="btn btn-primary mt-5 w-full"
            disabled={!canCreate}
            onClick={() => void handleCreateCircle()}
            type="button"
          >
            {isCreating ? "Creating..." : "Create circle"}
          </button>

          <div className="mt-6 border-t border-slate-100 pt-5">
            <h2 className="text-xl font-bold text-slate-950">
              Join by name
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Type the exact circle name and send the creator a request.
            </p>
            <label className="mt-4 block text-sm font-semibold text-slate-700">
              Circle name
              <input
                className="mt-2 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-100"
                maxLength={circleNameLimit}
                onChange={(event) => {
                  setJoinCircleName(event.target.value);
                  setError("");
                  setSuccessMessage("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void handleRequestJoinByName();
                  }
                }}
                placeholder="Exact circle name"
                value={joinCircleName}
              />
            </label>
            <button
              className="btn btn-secondary mt-3 w-full"
              disabled={!canRequestByName}
              onClick={() => void handleRequestJoinByName()}
              type="button"
            >
              {isRequestingByName ? "Requesting..." : "Request to join"}
            </button>
          </div>
        </div>

        <div className="grid gap-5">
          {isLoading ? (
            <div className="rounded-md border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-600">
              Loading circles...
            </div>
          ) : null}

          {!isLoading && !hasCircleActivity ? (
            <CircleEmptyGuide hasFriends={hasFriends} />
          ) : null}

          {!isLoading && incomingJoinRequests.length > 0 ? (
            <section>
              <h2 className="text-xl font-bold text-slate-950">
                Join requests
              </h2>
              <div className="mt-3 grid gap-3">
                {incomingJoinRequests.map((request) => (
                  <article
                    className="rounded-md border border-amber-200 bg-amber-50 p-4 shadow-sm"
                    key={request.id}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-bold text-slate-950">
                          @{request.fromUsername}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-amber-800">
                          Wants to join {request.circle.name}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          Sent {formatDate(request.createdAt)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={mutatingRequestId === request.id}
                          onClick={() =>
                            void handleRespondJoinRequest(request, "accept")
                          }
                          type="button"
                        >
                          Accept
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={mutatingRequestId === request.id}
                          onClick={() =>
                            void handleRespondJoinRequest(request, "decline")
                          }
                          type="button"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {!isLoading &&
          (discoverableCircles.length > 0 || outgoingJoinRequests.length > 0) ? (
            <section>
              <h2 className="text-xl font-bold text-slate-950">
                Friend circles
              </h2>
              <div className="mt-3 grid gap-3">
                {discoverableCircles.map((circle) => (
                  <article
                    className="rounded-md border border-slate-200 bg-white p-4 shadow-sm"
                    key={circle.id}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-500">
                          Created by @{circle.ownerUsername}
                        </p>
                        <h3 className="mt-1 text-xl font-bold text-slate-950">
                          {circle.name}
                        </h3>
                        <p className="mt-1 text-sm font-semibold text-teal-800">
                          {circle.memberUsernames.length} members
                        </p>
                      </div>
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={
                          mutatingCircleAction === `request:${circle.id}`
                        }
                        onClick={() => void handleRequestJoin(circle)}
                        type="button"
                      >
                        {mutatingCircleAction === `request:${circle.id}`
                          ? "Requesting..."
                          : "Request to join"}
                      </button>
                    </div>
                    {circle.description ? (
                      <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                        {circle.description}
                      </p>
                    ) : null}
                  </article>
                ))}

                {outgoingJoinRequests.map((request) => (
                  <article
                    className="rounded-md border border-dashed border-amber-300 bg-white p-4 shadow-sm"
                    key={request.id}
                  >
                    <p className="text-lg font-bold text-slate-950">
                      {request.circle.name}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-600">
                      Waiting for @{request.toUsername}
                    </p>
                    <span className="mt-3 inline-flex rounded-md bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
                      Pending
                    </span>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {!isLoading && hasCircleActivity ? (
            <section>
              <h2 className="text-xl font-bold text-slate-950">
                Your circles
              </h2>

              {circles.length === 0 ? (
                <div className="mt-3 rounded-md border border-dashed border-slate-300 bg-white p-6">
                  <h3 className="text-lg font-bold text-slate-950">
                    No circles yet
                  </h3>
                  <p className="mt-2 leading-7 text-slate-600">
                    Once you create or join a circle, it will appear here with
                    its shared room.
                  </p>
                </div>
              ) : null}

              <div className="mt-3 grid gap-4">
                {circles.map((circle) => {
                  const isOwner =
                    circle.ownerUsername.toLowerCase() === username.toLowerCase();
                  const circleAction: CircleAction = isOwner ? "delete" : "leave";
                  const actionKey = `${circleAction}:${circle.id}`;

                  return (
                    <article
                      className="motion-list-item rounded-md border border-slate-200 bg-white p-5 shadow-sm"
                      key={circle.id}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-500">
                            {isOwner
                              ? "Created by you"
                              : `Created by @${circle.ownerUsername}`}
                          </p>
                          <h3 className="mt-1 text-2xl font-bold text-slate-950">
                            {circle.name}
                          </h3>
                        </div>
                        <span className="rounded-md bg-teal-50 px-3 py-2 text-sm font-bold text-teal-800">
                          {circle.memberUsernames.length} members
                        </span>
                      </div>
                      {circle.description ? (
                        <p className="mt-4 rounded-md bg-slate-50 p-4 leading-7 text-slate-700">
                          {circle.description}
                        </p>
                      ) : null}
                      <div className="mt-4 flex flex-wrap gap-2">
                        {circle.memberUsernames.map((memberUsername) => (
                          <span
                            className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700"
                            key={memberUsername}
                          >
                            @{memberUsername}
                          </span>
                        ))}
                      </div>
                      <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                        <Link
                          className="btn btn-primary btn-sm"
                          href={`/circles/${circle.id}`}
                        >
                          Open circle room
                        </Link>
                        <button
                          className="btn btn-danger btn-sm"
                          disabled={mutatingCircleAction === actionKey}
                          onClick={() =>
                            void handleCircleAction(circle, circleAction)
                          }
                          type="button"
                        >
                          {mutatingCircleAction === actionKey
                            ? isOwner
                              ? "Deleting..."
                              : "Leaving..."
                            : isOwner
                              ? "Delete circle"
                              : "Leave circle"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function CircleEmptyGuide({ hasFriends }: { hasFriends: boolean }) {
  if (!hasFriends) {
    return (
      <section className="rounded-md border border-dashed border-teal-300 bg-teal-50 p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-normal text-teal-800">
          Groups start with trust
        </p>
        <h2 className="mt-2 text-2xl font-bold text-slate-950">
          Add one friend before creating a group.
        </h2>
        <p className="mt-3 max-w-2xl leading-7 text-slate-700">
          Circles are private shared rooms, so ConnectCircle starts them from
          accepted friendships. Add a friend first, then come back to create a
          small group.
        </p>
        <Link className="btn btn-primary mt-5" href="/social/connections">
          Add a friend first
        </Link>
      </section>
    );
  }

  return (
    <section className="rounded-md border border-dashed border-teal-300 bg-teal-50 p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-normal text-teal-800">
        First group
      </p>
      <h2 className="mt-2 text-2xl font-bold text-slate-950">
        Create one small room.
      </h2>
      <p className="mt-3 max-w-2xl leading-7 text-slate-700">
        Pick one or two accepted friends, give the circle a clear name, and
        open a quieter space for shared check-ins and chat.
      </p>
      <a className="btn btn-primary mt-5" href="#new-circle">
        Create a group
      </a>
    </section>
  );
}
