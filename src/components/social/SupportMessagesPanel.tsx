"use client";

import { useEffect, useMemo, useState } from "react";
import type { ConnectionSummary, Friendship } from "@/lib/connectionTypes";
import {
  supportMessageLimit,
  supportMessageSuggestions,
  type SupportMessage,
  type SupportMessageSummary,
} from "@/lib/supportMessageTypes";

type SupportMessagesPanelProps = {
  username: string;
};

const emptySummary: SupportMessageSummary = {
  receivedMessages: [],
  sentMessages: [],
};

function formatMessageDate(value: string) {
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

    return data.error || "We could not complete this request.";
  } catch {
    return "We could not complete this request.";
  }
}

export function SupportMessagesPanel({ username }: SupportMessagesPanelProps) {
  const [friendUsernames, setFriendUsernames] = useState<string[]>([]);
  const [selectedFriendUsername, setSelectedFriendUsername] = useState("");
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState<SupportMessageSummary>(emptySummary);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const trimmedMessage = message.trim();
  const hasFriends = friendUsernames.length > 0;
  const canSend =
    hasFriends &&
    selectedFriendUsername.length > 0 &&
    trimmedMessage.length > 0 &&
    trimmedMessage.length <= supportMessageLimit &&
    !isSending;
  const latestMessages = useMemo(
    () => summary.receivedMessages.slice(0, 4),
    [summary.receivedMessages],
  );
  const latestSentMessages = useMemo(
    () => summary.sentMessages.slice(0, 3),
    [summary.sentMessages],
  );

  async function loadSupportMessages() {
    const response = await fetch("/api/support-messages", {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Could not load support messages.");
    }

    const data: SupportMessageSummary = await response.json();
    setSummary(data);
  }

  useEffect(() => {
    let isActive = true;

    async function loadPanelData() {
      try {
        const [connectionsResponse, messagesResponse] = await Promise.all([
          fetch("/api/connections", { cache: "no-store" }),
          fetch("/api/support-messages", { cache: "no-store" }),
        ]);

        if (!connectionsResponse.ok || !messagesResponse.ok) {
          throw new Error("Could not load support panel.");
        }

        const connectionsData: ConnectionSummary =
          await connectionsResponse.json();
        const messagesData: SupportMessageSummary = await messagesResponse.json();
        const friends = connectionsData.friends
          .map((friendship) => getFriendUsername(friendship, username))
          .sort((first, second) => first.localeCompare(second));

        if (isActive) {
          setFriendUsernames(friends);
          setSelectedFriendUsername(friends[0] ?? "");
          setSummary(messagesData);
          setError("");
        }
      } catch {
        if (isActive) {
          setError("Support messages could not be loaded.");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadPanelData();

    return () => {
      isActive = false;
    };
  }, [username]);

  async function handleSendMessage() {
    if (!canSend) {
      return;
    }

    setIsSending(true);
    setError("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/support-messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          toUsername: selectedFriendUsername,
          message: trimmedMessage,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      setMessage("");
      setSuccessMessage(`Support note sent to @${selectedFriendUsername}.`);
      await loadSupportMessages();
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Support message could not be sent.",
      );
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section
      aria-labelledby="support-messages-title"
      className="mx-auto w-full max-w-5xl px-6 py-10"
    >
      <div>
        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-normal text-rose-700">
              Support notes
            </p>
            <h2
              className="mt-2 text-3xl font-bold leading-tight text-slate-950"
              id="support-messages-title"
            >
              Send a supportive note.
            </h2>
            <p className="mt-3 leading-7 text-slate-700">
              Choose an accepted friend and send a concise note they can read
              when they open their social space.
            </p>
          </div>

          <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
            <label
              className="block text-sm font-semibold text-slate-800"
              htmlFor="support-friend"
            >
              Friend
            </label>
            <select
              className="mt-2 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-800 outline-none focus:border-rose-400 focus:bg-white"
              disabled={!hasFriends || isLoading}
              id="support-friend"
              onChange={(event) => {
                setSelectedFriendUsername(event.target.value);
                setSuccessMessage("");
              }}
              value={selectedFriendUsername}
            >
              {friendUsernames.map((friendUsername) => (
                <option key={friendUsername} value={friendUsername}>
                  @{friendUsername}
                </option>
              ))}
            </select>

            <label
              className="mt-4 block text-sm font-semibold text-slate-800"
              htmlFor="support-message"
            >
              Note
            </label>
            <textarea
              className="mt-2 min-h-28 w-full resize-none rounded-md border border-slate-300 bg-slate-50 p-3 text-sm text-slate-900 outline-none focus:border-rose-400 focus:bg-white"
              disabled={!hasFriends || isLoading}
              id="support-message"
              maxLength={supportMessageLimit}
              onChange={(event) => {
                setMessage(event.target.value);
                setSuccessMessage("");
              }}
              placeholder="Write a supportive note..."
              value={message}
            />
            <div className="mt-1 text-right text-xs font-semibold text-slate-500">
              {message.length}/{supportMessageLimit}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {supportMessageSuggestions.map((suggestion) => (
                <button
                  className="mood-chip"
                  disabled={!hasFriends || isLoading}
                  key={suggestion}
                  onClick={() => {
                    setMessage(suggestion);
                    setSuccessMessage("");
                  }}
                  type="button"
                >
                  {suggestion}
                </button>
              ))}
            </div>

            {!isLoading && !hasFriends ? (
              <p className="mt-4 rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 text-sm font-semibold text-slate-600">
                Add accepted friends before sending support notes.
              </p>
            ) : null}

            <button
              className="btn btn-primary mt-5 w-full"
              disabled={!canSend}
              onClick={() => void handleSendMessage()}
              type="button"
            >
              {isSending ? "Sending..." : "Send note"}
            </button>

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

        <div className="mt-8 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <MessageList
            emptyText="Support notes from friends will appear here."
            messages={latestMessages}
            title="Notes for you"
            type="received"
          />
          <MessageList
            emptyText="Notes you send will be listed here."
            messages={latestSentMessages}
            title="Sent recently"
            type="sent"
          />
        </div>
      </div>
    </section>
  );
}

function MessageList({
  emptyText,
  messages,
  title,
  type,
}: {
  emptyText: string;
  messages: SupportMessage[];
  title: string;
  type: "received" | "sent";
}) {
  return (
    <section>
      <h3 className="text-xl font-bold text-slate-950">{title}</h3>
      {messages.length === 0 ? (
        <div className="mt-4 rounded-md border border-dashed border-slate-300 bg-white p-4">
          <p className="text-sm font-semibold leading-6 text-slate-600">
            {emptyText}
          </p>
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          {messages.map((supportMessage) => (
            <article
              className="rounded-md border border-slate-200 bg-white p-4 shadow-sm"
              key={supportMessage.id}
            >
              <p className="text-sm font-semibold text-slate-500">
                {type === "received"
                  ? `From @${supportMessage.fromUsername}`
                  : `To @${supportMessage.toUsername}`}
              </p>
              <p className="mt-2 leading-7 text-slate-800">
                {supportMessage.message}
              </p>
              <p className="mt-3 text-xs font-semibold text-slate-500">
                {formatMessageDate(supportMessage.createdAt)}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
