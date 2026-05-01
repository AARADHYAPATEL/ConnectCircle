"use client";

import { useEffect, useRef, useState } from "react";
import {
  chatMessageLimit,
  type ChatMessage,
  type ChatOverview,
  type ChatThread,
} from "@/lib/chatTypes";
import {
  emojiShortcodeExamples,
  emojiShortcodeOptions,
  renderEmojiShortcodes,
  type EmojiShortcodeOption,
} from "@/lib/emojiShortcodes";

type ChatPanelProps = {
  username: string;
};

type ActiveEmojiShortcode = {
  end: number;
  query: string;
  start: number;
};

const emptyOverview: ChatOverview = {
  friends: [],
  conversations: [],
};

function formatChatTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatChatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatChatPreview(message: ChatMessage, username: string) {
  const renderedMessage = renderEmojiShortcodes(message.message);
  const messagePrefix = message.fromUsername === username ? "You: " : "";
  const editedSuffix = message.editedAt ? " (edited)" : "";

  return `${messagePrefix}${renderedMessage}${editedSuffix}`;
}

function findActiveEmojiShortcode(
  value: string,
  cursorPosition: number,
): ActiveEmojiShortcode | null {
  const textBeforeCursor = value.slice(0, cursorPosition);
  const match = textBeforeCursor.match(/(^|\s):([a-zA-Z0-9_+-]{0,32})$/);

  if (!match) {
    return null;
  }

  const query = match[2].toLowerCase();

  return {
    end: cursorPosition,
    query,
    start: cursorPosition - query.length - 1,
  };
}

function getEmojiSuggestions(query: string) {
  const matchingOptions = emojiShortcodeOptions.filter((option) =>
    option.name.includes(query),
  );

  return matchingOptions
    .sort((first, second) => {
      const firstStartsWithQuery = first.name.startsWith(query);
      const secondStartsWithQuery = second.name.startsWith(query);

      if (firstStartsWithQuery !== secondStartsWithQuery) {
        return firstStartsWithQuery ? -1 : 1;
      }

      return first.name.localeCompare(second.name);
    })
    .slice(0, 8);
}

async function readErrorMessage(response: Response) {
  try {
    const data: { error?: string } = await response.json();

    return data.error || "Something went wrong.";
  } catch {
    return "Something went wrong.";
  }
}

export function ChatPanel({ username }: ChatPanelProps) {
  const [overview, setOverview] = useState<ChatOverview>(emptyOverview);
  const [activeFriendUsername, setActiveFriendUsername] = useState("");
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [message, setMessage] = useState("");
  const [composerCursorPosition, setComposerCursorPosition] = useState(0);
  const [isLoadingOverview, setIsLoadingOverview] = useState(true);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageText, setEditingMessageText] = useState("");
  const [mutatingMessageId, setMutatingMessageId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const trimmedMessage = message.trim();
  const renderedMessagePreview = renderEmojiShortcodes(message);
  const hasEmojiPreview = renderedMessagePreview !== message;
  const activeEmojiShortcode = findActiveEmojiShortcode(
    message,
    composerCursorPosition,
  );
  const emojiSuggestions = activeEmojiShortcode
    ? getEmojiSuggestions(activeEmojiShortcode.query)
    : [];
  const hasFriends = overview.friends.length > 0;
  const canSend =
    Boolean(activeFriendUsername) &&
    trimmedMessage.length > 0 &&
    trimmedMessage.length <= chatMessageLimit &&
    !isSending;

  async function loadOverview() {
    const response = await fetch("/api/chat", {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Could not load chats.");
    }

    const data: ChatOverview = await response.json();
    setOverview(data);

    return data;
  }

  async function loadThread(friendUsername: string) {
    const response = await fetch(
      `/api/chat?friend=${encodeURIComponent(friendUsername)}`,
      {
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    const data: ChatThread = await response.json();
    setThread(data);
    setError("");
  }

  useEffect(() => {
    let isActive = true;

    async function loadInitialChats() {
      try {
        const data = await loadOverview();
        const firstFriend =
          data.conversations[0]?.friendUsername ?? data.friends[0] ?? "";

        if (isActive) {
          setActiveFriendUsername((currentFriendUsername) =>
            currentFriendUsername || firstFriend,
          );
          setError("");
        }
      } catch {
        if (isActive) {
          setError("Chats could not be loaded.");
        }
      } finally {
        if (isActive) {
          setIsLoadingOverview(false);
        }
      }
    }

    void loadInitialChats();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!activeFriendUsername) {
      return;
    }

    let isActive = true;
    let hasLoadedOnce = false;

    async function refreshThread() {
      if (!isActive) {
        return;
      }

      try {
        if (!hasLoadedOnce) {
          setIsLoadingThread(true);
        }

        await loadThread(activeFriendUsername);
        await loadOverview();
        hasLoadedOnce = true;
      } catch (threadError) {
        if (isActive) {
          setError(
            threadError instanceof Error
              ? threadError.message
              : "Chat could not be loaded.",
          );
        }
      } finally {
        if (isActive) {
          setIsLoadingThread(false);
        }
      }
    }

    void refreshThread();
    const refreshInterval = window.setInterval(refreshThread, 2500);

    return () => {
      isActive = false;
      window.clearInterval(refreshInterval);
    };
  }, [activeFriendUsername]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages.length]);

  async function handleSendMessage() {
    if (!canSend) {
      return;
    }

    setIsSending(true);
    setError("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          toUsername: activeFriendUsername,
          message: trimmedMessage,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      setMessage("");
      setComposerCursorPosition(0);
      await loadThread(activeFriendUsername);
      await loadOverview();
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Message could not be sent.",
      );
    } finally {
      setIsSending(false);
    }
  }

  function handleComposerChange(value: string, cursorPosition: number | null) {
    setMessage(value);
    setComposerCursorPosition(cursorPosition ?? value.length);
  }

  function handleEmojiSelection(option: EmojiShortcodeOption) {
    const activeShortcode =
      activeEmojiShortcode ??
      findActiveEmojiShortcode(message, composerCursorPosition);

    if (!activeShortcode) {
      const nextMessage = `${message}${message.endsWith(" ") || !message ? "" : " "}${
        option.emoji
      } `;
      const nextCursorPosition = nextMessage.length;

      setMessage(nextMessage);
      setComposerCursorPosition(nextCursorPosition);
      window.requestAnimationFrame(() => {
        composerTextareaRef.current?.focus();
        composerTextareaRef.current?.setSelectionRange(
          nextCursorPosition,
          nextCursorPosition,
        );
      });
      return;
    }

    const nextMessage = `${message.slice(0, activeShortcode.start)}${
      option.emoji
    } ${message.slice(activeShortcode.end)}`;
    const nextCursorPosition = activeShortcode.start + option.emoji.length + 1;

    setMessage(nextMessage);
    setComposerCursorPosition(nextCursorPosition);
    window.requestAnimationFrame(() => {
      composerTextareaRef.current?.focus();
      composerTextareaRef.current?.setSelectionRange(
        nextCursorPosition,
        nextCursorPosition,
      );
    });
  }

  function startEditingMessage(chatMessage: ChatMessage) {
    setEditingMessageId(chatMessage.id);
    setEditingMessageText(chatMessage.message);
    setError("");
  }

  function cancelEditingMessage() {
    setEditingMessageId(null);
    setEditingMessageText("");
  }

  async function refreshActiveConversation() {
    if (!activeFriendUsername) {
      return;
    }

    await loadThread(activeFriendUsername);
    await loadOverview();
  }

  async function handleEditMessage(messageId: string) {
    const cleanMessage = editingMessageText.trim();

    if (!cleanMessage || cleanMessage.length > chatMessageLimit) {
      return;
    }

    setMutatingMessageId(messageId);
    setError("");

    try {
      const response = await fetch("/api/chat", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: messageId,
          message: cleanMessage,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      cancelEditingMessage();
      await refreshActiveConversation();
    } catch (editError) {
      setError(
        editError instanceof Error
          ? editError.message
          : "Message could not be edited.",
      );
    } finally {
      setMutatingMessageId(null);
    }
  }

  async function handleDeleteMessage(chatMessage: ChatMessage) {
    const shouldDelete = window.confirm("Delete this message?");

    if (!shouldDelete) {
      return;
    }

    setMutatingMessageId(chatMessage.id);
    setError("");

    try {
      const response = await fetch("/api/chat", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: chatMessage.id }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      if (editingMessageId === chatMessage.id) {
        cancelEditingMessage();
      }

      await refreshActiveConversation();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Message could not be deleted.",
      );
    } finally {
      setMutatingMessageId(null);
    }
  }

  return (
    <section
      aria-labelledby="chat-title"
      className="mx-auto w-full max-w-6xl px-6 py-10"
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-normal text-emerald-700">
            Live chat
          </p>
          <h1
            className="mt-2 text-4xl font-bold leading-tight text-slate-950"
            id="chat-title"
          >
            Message accepted friends.
          </h1>
        </div>
        <span className="live-pill rounded-md bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">
          Auto-refreshing
        </span>
      </div>

      <div className="motion-panel grid h-[calc(100vh-15rem)] min-h-[34rem] grid-rows-[auto_1fr] overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm lg:grid-cols-[18rem_1fr] lg:grid-rows-1">
        <aside className="min-h-0 border-b border-slate-200 bg-slate-50 lg:border-b-0 lg:border-r">
          <div className="border-b border-slate-200 p-4">
            <h2 className="text-lg font-bold text-slate-950">Chats</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              @{username}
            </p>
          </div>

          <div className="max-h-48 overflow-y-auto lg:max-h-none">
            {isLoadingOverview ? (
              <p className="p-4 text-sm font-semibold text-slate-500">
                Loading chats...
              </p>
            ) : null}

            {!isLoadingOverview && !hasFriends ? (
              <div className="p-4">
                <p className="rounded-md border border-dashed border-slate-300 bg-white p-4 text-sm font-semibold leading-6 text-slate-600">
                  Add accepted friends before starting a chat.
                </p>
              </div>
            ) : null}

            {!isLoadingOverview && hasFriends
              ? overview.conversations.map((conversation) => {
                  const isActive =
                    conversation.friendUsername === activeFriendUsername;
                  const lastMessage = conversation.lastMessage;

                  return (
                    <button
                      className={`motion-list-item block w-full border-b border-slate-200 p-4 text-left transition ${
                        isActive
                          ? "bg-white"
                          : "bg-slate-50 hover:bg-white"
                      }`}
                      key={conversation.friendUsername}
                      onClick={() => {
                        setThread(null);
                        setActiveFriendUsername(conversation.friendUsername);
                        setError("");
                      }}
                      type="button"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-bold text-slate-950">
                          @{conversation.friendUsername}
                        </p>
                        {lastMessage ? (
                          <span className="text-xs font-semibold text-slate-500">
                            {formatChatDate(lastMessage.createdAt)}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-sm font-semibold text-slate-500">
                        {lastMessage
                          ? formatChatPreview(lastMessage, username)
                          : "Start a new conversation"}
                      </p>
                    </button>
                  );
                })
              : null}
          </div>
        </aside>

        <div className="flex min-h-0 flex-col">
          <div className="border-b border-slate-200 p-4">
            {activeFriendUsername ? (
              <>
                <p className="text-lg font-bold text-slate-950">
                  @{activeFriendUsername}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Accepted friend
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-bold text-slate-950">
                  No chat selected
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Choose a friend to open a conversation.
                </p>
              </>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-4">
            {isLoadingThread ? (
              <p className="text-sm font-semibold text-slate-500">
                Loading conversation...
              </p>
            ) : null}

            {!isLoadingThread &&
            activeFriendUsername &&
            thread?.messages.length === 0 ? (
              <div className="mx-auto mt-16 max-w-sm rounded-md border border-dashed border-slate-300 bg-white p-5 text-center">
                <p className="text-sm font-semibold leading-6 text-slate-600">
                  No messages yet. Start with a quick hello or check-in.
                </p>
              </div>
            ) : null}

            <div className="grid gap-3">
              {thread?.messages.map((chatMessage) => (
                <ChatBubble
                  editingText={editingMessageText}
                  isEditing={editingMessageId === chatMessage.id}
                  isMine={chatMessage.fromUsername === username}
                  isMutating={mutatingMessageId === chatMessage.id}
                  key={chatMessage.id}
                  message={chatMessage}
                  onCancelEdit={cancelEditingMessage}
                  onDelete={() => void handleDeleteMessage(chatMessage)}
                  onEditTextChange={setEditingMessageText}
                  onSaveEdit={() => void handleEditMessage(chatMessage.id)}
                  onStartEdit={() => startEditingMessage(chatMessage)}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <div className="border-t border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <textarea
                className="min-h-12 flex-1 resize-none rounded-md border border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                disabled={!activeFriendUsername || isSending}
                maxLength={chatMessageLimit}
                onChange={(event) =>
                  handleComposerChange(
                    event.target.value,
                    event.target.selectionStart,
                  )
                }
                onClick={(event) =>
                  setComposerCursorPosition(event.currentTarget.selectionStart)
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();

                    if (emojiSuggestions.length > 0) {
                      handleEmojiSelection(emojiSuggestions[0]);
                      return;
                    }

                    void handleSendMessage();
                  }
                }}
                onKeyUp={(event) =>
                  setComposerCursorPosition(event.currentTarget.selectionStart)
                }
                onSelect={(event) =>
                  setComposerCursorPosition(event.currentTarget.selectionStart)
                }
                placeholder="Message..."
                ref={composerTextareaRef}
                value={message}
              />
              <button
                className="btn btn-primary"
                disabled={!canSend}
                onClick={() => void handleSendMessage()}
                type="button"
              >
                {isSending ? "Sending..." : "Send"}
              </button>
            </div>

            {emojiSuggestions.length > 0 ? (
              <div className="emoji-suggestions mt-3 rounded-md border border-emerald-100 bg-emerald-50 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-normal text-emerald-800">
                    Emoji matches
                  </p>
                  {activeEmojiShortcode ? (
                    <p className="text-xs font-semibold text-emerald-800">
                      :{activeEmojiShortcode.query}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {emojiSuggestions.map((option) => (
                    <button
                      className="mood-chip bg-white"
                      key={option.shortcode}
                      onClick={() => handleEmojiSelection(option)}
                      type="button"
                    >
                      <span className="mr-2 text-base">{option.emoji}</span>
                      {option.shortcode}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {hasEmojiPreview ? (
              <div className="emoji-preview mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-bold uppercase tracking-normal text-slate-500">
                  Preview
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm font-semibold text-slate-800">
                  {renderedMessagePreview}
                </p>
              </div>
            ) : null}

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-500">
                Press Enter to send, Shift + Enter for a new line.
              </p>
              <p className="text-xs font-semibold text-slate-500">
                {message.length}/{chatMessageLimit}
              </p>
            </div>
            <p className="mt-2 text-xs font-semibold text-slate-500">
              Emoji shortcodes work here: {emojiShortcodeExamples.join(", ")}.
            </p>

            {error ? (
              <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-900">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function ChatBubble({
  editingText,
  isEditing,
  isMine,
  isMutating,
  message,
  onCancelEdit,
  onDelete,
  onEditTextChange,
  onSaveEdit,
  onStartEdit,
}: {
  editingText: string;
  isEditing: boolean;
  isMine: boolean;
  isMutating: boolean;
  message: ChatMessage;
  onCancelEdit: () => void;
  onDelete: () => void;
  onEditTextChange: (value: string) => void;
  onSaveEdit: () => void;
  onStartEdit: () => void;
}) {
  const canSaveEdit =
    editingText.trim().length > 0 &&
    editingText.trim().length <= chatMessageLimit &&
    !isMutating;

  return (
    <div
      className={`chat-bubble flex ${
        isMine ? "chat-bubble-mine justify-end" : "justify-start"
      }`}
    >
      <div
        className={`max-w-[82%] rounded-md px-4 py-3 shadow-sm ${
          isMine
            ? "bg-emerald-700 text-white"
            : "border border-slate-200 bg-white text-slate-900"
        }`}
      >
        {isEditing ? (
          <div className="grid gap-3">
            <textarea
              className="min-h-24 w-full resize-none rounded-md border border-emerald-200 bg-white p-3 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              maxLength={chatMessageLimit}
              onChange={(event) => onEditTextChange(event.target.value)}
              value={editingText}
            />
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                className="btn btn-secondary btn-sm"
                disabled={isMutating}
                onClick={onCancelEdit}
                type="button"
              >
                Cancel
              </button>
              <button
                className="btn btn-primary btn-sm"
                disabled={!canSaveEdit}
                onClick={onSaveEdit}
                type="button"
              >
                {isMutating ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="whitespace-pre-wrap leading-6">
              {renderEmojiShortcodes(message.message)}
            </p>
            <div
              className={`mt-2 flex flex-wrap items-center justify-end gap-2 text-xs font-semibold ${
                isMine ? "text-emerald-50" : "text-slate-500"
              }`}
            >
              <span>{formatChatTime(message.createdAt)}</span>
              {message.editedAt ? <span>Edited</span> : null}
            </div>
            {isMine ? (
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button
                  className="rounded-md bg-white/10 px-2 py-1 text-xs font-bold text-white transition hover:bg-white/20"
                  disabled={isMutating}
                  onClick={onStartEdit}
                  type="button"
                >
                  Edit
                </button>
                <button
                  className="rounded-md bg-white/10 px-2 py-1 text-xs font-bold text-white transition hover:bg-white/20"
                  disabled={isMutating}
                  onClick={onDelete}
                  type="button"
                >
                  {isMutating ? "Deleting..." : "Delete"}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
