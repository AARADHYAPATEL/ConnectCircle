"use client";

import { useEffect, useRef, useState, type ClipboardEvent } from "react";
import { EmojiPicker } from "@/components/chat/EmojiPicker";
import {
  ChatImageAttachmentInput,
  copyChatMediaAttachmentToClipboard,
  createChatMediaAttachmentFromFile,
  getClipboardMediaFile,
} from "@/components/chat/ChatImageAttachmentInput";
import { MessageActionsMenu } from "@/components/chat/MessageActionsMenu";
import { ReportUserDialog } from "@/components/reports/ReportUserButton";
import {
  getChatMediaAttachmentKind,
  getChatMediaAttachmentSource,
  type ChatMediaAttachment,
} from "@/lib/chatImageAttachments";
import {
  chatMessageLimit,
  type ChatMessage,
  type ChatOverview,
  type ChatThread,
} from "@/lib/chatTypes";
import {
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
  const attachmentLabel =
    message.imageAttachment &&
    getChatMediaAttachmentKind(message.imageAttachment) === "video"
      ? "Video"
      : "Photo";
  const messageContent = message.imageAttachment
    ? renderedMessage
      ? `${attachmentLabel} - ${renderedMessage}`
      : attachmentLabel
    : renderedMessage;
  const editedSuffix = message.editedAt ? " (edited)" : "";

  return `${messagePrefix}${messageContent}${editedSuffix}`;
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

    return data.error || "We could not complete this request.";
  } catch {
    return "We could not complete this request.";
  }
}

export function ChatPanel({ username }: ChatPanelProps) {
  const [overview, setOverview] = useState<ChatOverview>(emptyOverview);
  const [activeFriendUsername, setActiveFriendUsername] = useState("");
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [message, setMessage] = useState("");
  const [selectedImageAttachment, setSelectedImageAttachment] =
    useState<ChatMediaAttachment | null>(null);
  const [composerCursorPosition, setComposerCursorPosition] = useState(0);
  const [isLoadingOverview, setIsLoadingOverview] = useState(true);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageText, setEditingMessageText] = useState("");
  const [editingImageAttachment, setEditingImageAttachment] =
    useState<ChatMediaAttachment | null>(null);
  const [mutatingMessageId, setMutatingMessageId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState("");
  const [reportNotice, setReportNotice] = useState("");
  const [reportingMessage, setReportingMessage] = useState<ChatMessage | null>(
    null,
  );
  const [copiedImageMessageId, setCopiedImageMessageId] = useState<
    string | null
  >(null);
  const [isChatExpanded, setIsChatExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editComposerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const copyImageResetTimeoutRef = useRef<number | null>(null);
  const [editingCursorPosition, setEditingCursorPosition] = useState(0);

  const trimmedMessage = message.trim();
  const trimmedEditingMessage = editingMessageText.trim();
  const renderedMessagePreview = renderEmojiShortcodes(message);
  const hasEmojiPreview = renderedMessagePreview !== message;
  const editingMessage =
    thread?.messages.find((chatMessage) => chatMessage.id === editingMessageId) ??
    null;
  const activeEmojiShortcode = findActiveEmojiShortcode(
    message,
    composerCursorPosition,
  );
  const activeEditEmojiShortcode = findActiveEmojiShortcode(
    editingMessageText,
    editingCursorPosition,
  );
  const emojiSuggestions = activeEmojiShortcode
    ? getEmojiSuggestions(activeEmojiShortcode.query)
    : [];
  const editEmojiSuggestions = activeEditEmojiShortcode
    ? getEmojiSuggestions(activeEditEmojiShortcode.query)
    : [];
  const hasFriends = overview.friends.length > 0;
  const canSend =
    Boolean(activeFriendUsername) &&
    (trimmedMessage.length > 0 || Boolean(selectedImageAttachment)) &&
    trimmedMessage.length <= chatMessageLimit &&
    !isSending;
  const canSaveEdit =
    Boolean(editingMessageId) &&
    (trimmedEditingMessage.length > 0 || Boolean(editingImageAttachment)) &&
    trimmedEditingMessage.length <= chatMessageLimit &&
    !mutatingMessageId;

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

  useEffect(
    () => () => {
      if (copyImageResetTimeoutRef.current) {
        window.clearTimeout(copyImageResetTimeoutRef.current);
      }
    },
    [],
  );

  async function handleSendMessage() {
    if (!canSend) {
      return;
    }

    setIsSending(true);
    setError("");
    setReportNotice("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          toUsername: activeFriendUsername,
          message: trimmedMessage,
          imageAttachment: selectedImageAttachment,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      setMessage("");
      setSelectedImageAttachment(null);
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

  async function handleComposerPaste(
    event: ClipboardEvent<HTMLTextAreaElement>,
  ) {
    const mediaFile = getClipboardMediaFile(event.clipboardData);

    if (!mediaFile) {
      return;
    }

    event.preventDefault();

    try {
      const attachment = await createChatMediaAttachmentFromFile(mediaFile);

      setSelectedImageAttachment(attachment);
      setError("");
    } catch (pasteError) {
      setError(
        pasteError instanceof Error
          ? pasteError.message
          : "Attachment could not be attached.",
      );
    }
  }

  function handleEmojiSelection(option: EmojiShortcodeOption) {
    const activeShortcode =
      activeEmojiShortcode ??
      findActiveEmojiShortcode(message, composerCursorPosition);

    if (!activeShortcode) {
      const nextMessage = `${message.slice(0, composerCursorPosition)}${
        option.emoji
      } ${message.slice(composerCursorPosition)}`;
      const nextCursorPosition =
        composerCursorPosition + option.emoji.length + 1;

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

  function handleEditComposerChange(
    value: string,
    cursorPosition: number | null,
  ) {
    setEditingMessageText(value);
    setEditingCursorPosition(cursorPosition ?? value.length);
  }

  async function handleEditComposerPaste(
    event: ClipboardEvent<HTMLTextAreaElement>,
  ) {
    const mediaFile = getClipboardMediaFile(event.clipboardData);

    if (!mediaFile) {
      return;
    }

    event.preventDefault();

    try {
      const attachment = await createChatMediaAttachmentFromFile(mediaFile);

      setEditingImageAttachment(attachment);
      setError("");
    } catch (pasteError) {
      setError(
        pasteError instanceof Error
          ? pasteError.message
          : "Attachment could not be attached.",
      );
    }
  }

  function handleEditEmojiSelection(option: EmojiShortcodeOption) {
    const activeShortcode =
      activeEditEmojiShortcode ??
      findActiveEmojiShortcode(editingMessageText, editingCursorPosition);
    const nextMessage = activeShortcode
      ? `${editingMessageText.slice(0, activeShortcode.start)}${
          option.emoji
        } ${editingMessageText.slice(activeShortcode.end)}`
      : `${editingMessageText.slice(0, editingCursorPosition)}${
          option.emoji
        } ${editingMessageText.slice(editingCursorPosition)}`;
    const nextCursorPosition = activeShortcode
      ? activeShortcode.start + option.emoji.length + 1
      : editingCursorPosition + option.emoji.length + 1;

    setEditingMessageText(nextMessage);
    setEditingCursorPosition(nextCursorPosition);
    window.requestAnimationFrame(() => {
      editComposerTextareaRef.current?.focus();
      editComposerTextareaRef.current?.setSelectionRange(
        nextCursorPosition,
        nextCursorPosition,
      );
    });
  }

  function startEditingMessage(chatMessage: ChatMessage) {
    setEditingMessageId(chatMessage.id);
    setEditingMessageText(chatMessage.message);
    setEditingImageAttachment(chatMessage.imageAttachment ?? null);
    setEditingCursorPosition(chatMessage.message.length);
    setError("");
    window.requestAnimationFrame(() => {
      editComposerTextareaRef.current?.focus();
      editComposerTextareaRef.current?.setSelectionRange(
        chatMessage.message.length,
        chatMessage.message.length,
      );
    });
  }

  function cancelEditingMessage() {
    setEditingMessageId(null);
    setEditingMessageText("");
    setEditingImageAttachment(null);
    setEditingCursorPosition(0);
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

    if (
      (!cleanMessage && !editingImageAttachment) ||
      cleanMessage.length > chatMessageLimit
    ) {
      return;
    }

    setMutatingMessageId(messageId);
    setError("");
    setReportNotice("");

    try {
      const response = await fetch("/api/chat", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: messageId,
          message: cleanMessage,
          imageAttachment: editingImageAttachment,
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
    setReportNotice("");

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

  async function handleCopyMessageImage(chatMessage: ChatMessage) {
    if (!chatMessage.imageAttachment) {
      return;
    }

    setError("");
    setReportNotice("");

    try {
      await copyChatMediaAttachmentToClipboard(chatMessage.imageAttachment);
      setCopiedImageMessageId(chatMessage.id);

      if (copyImageResetTimeoutRef.current) {
        window.clearTimeout(copyImageResetTimeoutRef.current);
      }

      copyImageResetTimeoutRef.current = window.setTimeout(() => {
        setCopiedImageMessageId((currentMessageId) =>
          currentMessageId === chatMessage.id ? null : currentMessageId,
        );
      }, 1600);
    } catch (copyError) {
      setError(
        copyError instanceof Error
          ? copyError.message
          : "Attachment could not be copied.",
      );
    }
  }

  return (
    <section
      aria-labelledby="chat-title"
      className="mx-auto w-full max-w-[96rem] px-4 py-6 sm:px-6 lg:py-8"
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-normal text-emerald-700">
            Direct messages
          </p>
          <h1
            className="mt-2 text-4xl font-bold leading-tight text-slate-950"
            id="chat-title"
          >
            Chat with accepted friends.
          </h1>
        </div>
        <span className="live-pill rounded-md bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">
          Auto-refresh on
        </span>
      </div>

      <div
        className={`motion-panel grid overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm ${
          isChatExpanded
            ? "h-[calc(100vh-6rem)] min-h-[48rem] grid-rows-1"
            : "h-[calc(100vh-9rem)] min-h-[42rem] grid-rows-[auto_1fr] lg:grid-cols-[16rem_minmax(0,1fr)] lg:grid-rows-1 xl:grid-cols-[17rem_minmax(0,1fr)]"
        }`}
      >
        <aside
          className={`min-h-0 border-b border-slate-200 bg-slate-50 lg:border-b-0 lg:border-r ${
            isChatExpanded ? "hidden" : ""
          }`}
        >
          <div className="border-b border-slate-200 p-4">
            <h2 className="text-lg font-bold text-slate-950">Conversations</h2>
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
                  Add accepted friends before starting a conversation.
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
                        setSelectedImageAttachment(null);
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
                          : "Start a conversation"}
                      </p>
                    </button>
                  );
                })
              : null}
          </div>
        </aside>

        <div className="flex min-h-0 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
            <div>
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
                    No conversation selected
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    Choose a friend to open the conversation.
                  </p>
                </>
              )}
            </div>
            <button
              aria-pressed={isChatExpanded}
              className="btn btn-secondary btn-sm"
              onClick={() =>
                setIsChatExpanded((currentIsExpanded) => !currentIsExpanded)
              }
              type="button"
            >
              {isChatExpanded ? "Minimize chat" : "Expand chat"}
            </button>
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
                  No messages yet. Start with a short greeting or check-in.
                </p>
              </div>
            ) : null}

            <div className="grid gap-3">
              {thread?.messages.map((chatMessage) => (
                <ChatBubble
                  isExpanded={isChatExpanded}
                  isMine={chatMessage.fromUsername === username}
                  isImageCopied={copiedImageMessageId === chatMessage.id}
                  isMutating={mutatingMessageId === chatMessage.id}
                  key={chatMessage.id}
                  message={chatMessage}
                  onCopyImage={() => void handleCopyMessageImage(chatMessage)}
                  onDelete={() => void handleDeleteMessage(chatMessage)}
                  onReport={() => {
                    setReportNotice("");
                    setReportingMessage(chatMessage);
                  }}
                  onStartEdit={() => startEditingMessage(chatMessage)}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <div className="border-t border-slate-200 bg-white p-3">
            {editingMessage ? (
              <>
                <div className="mb-3 rounded-md border-l-4 border-emerald-500 bg-emerald-50 px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-black uppercase tracking-normal text-emerald-800">
                        Editing message
                      </p>
                      <p className="mt-1 truncate text-sm font-semibold text-slate-700">
                        {editingMessage.message
                          ? renderEmojiShortcodes(editingMessage.message)
                          : editingMessage.imageAttachment &&
                              getChatMediaAttachmentKind(
                                editingMessage.imageAttachment,
                              ) === "video"
                            ? "Video"
                            : "Photo"}
                      </p>
                    </div>
                    <button
                      className="rounded-md px-2 py-1 text-xs font-black text-slate-500 transition hover:bg-white hover:text-slate-900"
                      disabled={Boolean(mutatingMessageId)}
                      onClick={cancelEditingMessage}
                      type="button"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <EmojiPicker
                    disabled={Boolean(mutatingMessageId)}
                    onSelect={handleEditEmojiSelection}
                  />
                  <textarea
                    className="min-h-10 flex-1 resize-none rounded-md border border-emerald-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                    disabled={Boolean(mutatingMessageId)}
                    maxLength={chatMessageLimit}
                    onChange={(event) =>
                      handleEditComposerChange(
                        event.target.value,
                        event.target.selectionStart,
                      )
                    }
                    onClick={(event) =>
                      setEditingCursorPosition(
                        event.currentTarget.selectionStart,
                      )
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();

                        if (editEmojiSuggestions.length > 0) {
                          handleEditEmojiSelection(editEmojiSuggestions[0]);
                          return;
                        }

                        if (canSaveEdit && editingMessageId) {
                          void handleEditMessage(editingMessageId);
                        }
                      }
                    }}
                    onKeyUp={(event) =>
                      setEditingCursorPosition(
                        event.currentTarget.selectionStart,
                      )
                    }
                    onPaste={(event) => void handleEditComposerPaste(event)}
                    onSelect={(event) =>
                      setEditingCursorPosition(
                        event.currentTarget.selectionStart,
                      )
                    }
                    placeholder="Edit message..."
                    ref={editComposerTextareaRef}
                    value={editingMessageText}
                  />
                  <button
                    className="btn btn-primary"
                    disabled={!canSaveEdit || !editingMessageId}
                    onClick={() =>
                      editingMessageId
                        ? void handleEditMessage(editingMessageId)
                        : undefined
                    }
                    type="button"
                  >
                    {mutatingMessageId ? "Saving..." : "Save"}
                  </button>
                </div>

                <ChatImageAttachmentInput
                  attachment={editingImageAttachment}
                  density="compact"
                  disabled={Boolean(mutatingMessageId)}
                  onAttachmentChange={setEditingImageAttachment}
                  onError={setError}
                  tone="emerald"
                />

                {editEmojiSuggestions.length > 0 ? (
                  <div className="emoji-suggestions mt-3 rounded-md border border-emerald-100 bg-emerald-50 p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-bold uppercase tracking-normal text-emerald-800">
                        Emoji matches
                      </p>
                      {activeEditEmojiShortcode ? (
                        <p className="text-xs font-semibold text-emerald-800">
                          :{activeEditEmojiShortcode.query}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {editEmojiSuggestions.map((option) => (
                        <button
                          className="mood-chip bg-white"
                          key={option.shortcode}
                          onClick={() => handleEditEmojiSelection(option)}
                          type="button"
                        >
                          <span className="mr-2 text-base">{option.emoji}</span>
                          {option.shortcode}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-500">
                    Press Enter to save. Use Shift + Enter for a new line.
                  </p>
                  <p className="text-xs font-semibold text-slate-500">
                    {editingMessageText.length}/{chatMessageLimit}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <EmojiPicker
                    disabled={!activeFriendUsername || isSending}
                    onSelect={handleEmojiSelection}
                  />
                  <textarea
                    className="min-h-10 flex-1 resize-none rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                    disabled={!activeFriendUsername || isSending}
                    maxLength={chatMessageLimit}
                    onChange={(event) =>
                      handleComposerChange(
                        event.target.value,
                        event.target.selectionStart,
                      )
                    }
                    onClick={(event) =>
                      setComposerCursorPosition(
                        event.currentTarget.selectionStart,
                      )
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
                      setComposerCursorPosition(
                        event.currentTarget.selectionStart,
                      )
                    }
                    onPaste={(event) => void handleComposerPaste(event)}
                    onSelect={(event) =>
                      setComposerCursorPosition(
                        event.currentTarget.selectionStart,
                      )
                    }
                    placeholder="Write a message..."
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

                <ChatImageAttachmentInput
                  attachment={selectedImageAttachment}
                  density="compact"
                  disabled={!activeFriendUsername || isSending}
                  onAttachmentChange={setSelectedImageAttachment}
                  onError={setError}
                  tone="emerald"
                />

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
                    Press Enter to send. Use Shift + Enter for a new line.
                  </p>
                  <p className="text-xs font-semibold text-slate-500">
                    {message.length}/{chatMessageLimit}
                  </p>
                </div>
              </>
            )}

            {error ? (
              <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-900">
                {error}
              </p>
            ) : null}
            {reportNotice ? (
              <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
                {reportNotice}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      {reportingMessage ? (
        <ReportUserDialog
          contextId={reportingMessage.id}
          contextType="dm_message"
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              setReportingMessage(null);
            }
          }}
          onSubmitted={() =>
            setReportNotice(
              "Report submitted. Thanks for helping keep ConnectCircle safe.",
            )
          }
          open={Boolean(reportingMessage)}
          reportedUsername={reportingMessage.fromUsername}
          subjectLabel={`@${reportingMessage.fromUsername}'s message`}
        />
      ) : null}
    </section>
  );
}

function ChatBubble({
  isExpanded,
  isMine,
  isImageCopied,
  isMutating,
  message,
  onCopyImage,
  onDelete,
  onReport,
  onStartEdit,
}: {
  isExpanded: boolean;
  isMine: boolean;
  isImageCopied: boolean;
  isMutating: boolean;
  message: ChatMessage;
  onCopyImage: () => void;
  onDelete: () => void;
  onReport: () => void;
  onStartEdit: () => void;
}) {
  const bubbleWidthClass = isExpanded
    ? "max-w-[92%] sm:max-w-[34rem] lg:max-w-[44rem]"
    : "max-w-[82%]";
  const canReport = !isMine;
  const hasActions = Boolean(message.imageAttachment) || isMine || canReport;
  const attachmentKind = message.imageAttachment
    ? getChatMediaAttachmentKind(message.imageAttachment)
    : null;
  const attachmentSource = message.imageAttachment
    ? getChatMediaAttachmentSource(message.imageAttachment)
    : "";

  return (
    <div
      className={`chat-bubble relative focus-within:z-10 flex ${
        isMine ? "chat-bubble-mine justify-end" : "justify-start"
      }`}
    >
      <div
        className={`${bubbleWidthClass} rounded-md px-4 py-3 shadow-sm ${
          isMine
            ? "bg-emerald-700 text-white"
            : "border border-slate-200 bg-white text-slate-900"
        }`}
      >
        {message.imageAttachment && attachmentKind === "video" ? (
          <video
            aria-label={message.imageAttachment.name}
            className={`mb-3 block max-w-full rounded-md border ${
              isExpanded ? "max-h-72" : "max-h-52"
            } ${isMine ? "border-white/20" : "border-slate-200"}`}
            controls
            playsInline
            preload="metadata"
            src={attachmentSource}
          />
        ) : null}
        {message.imageAttachment && attachmentKind === "image" ? (
          <a
            aria-label={`Open ${message.imageAttachment.name}`}
            className="mb-3 block outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            href={attachmentSource}
            rel="noreferrer"
            target="_blank"
          >
            <img
              alt={message.imageAttachment.name}
              className={`block max-w-full rounded-md border ${
                isExpanded ? "max-h-64" : "max-h-48"
              } ${isMine ? "border-white/20" : "border-slate-200"}`}
              src={attachmentSource}
            />
          </a>
        ) : null}
        {message.message ? (
          <p className="whitespace-pre-wrap leading-6">
            {renderEmojiShortcodes(message.message)}
          </p>
        ) : null}
        <div
          className={`mt-2 flex flex-wrap items-center justify-end gap-2 text-xs font-semibold ${
            isMine ? "text-emerald-50" : "text-slate-500"
          }`}
        >
          <span>{formatChatTime(message.createdAt)}</span>
          {message.editedAt ? <span>Edited</span> : null}
        </div>
        {hasActions ? (
          <div
            className={`mt-3 flex flex-wrap gap-2 ${
              isMine ? "justify-end" : "justify-start"
            }`}
          >
            <MessageActionsMenu
              align={isMine ? "right" : "left"}
              canCopyMedia={Boolean(message.imageAttachment)}
              canDelete={isMine}
              canEdit={isMine}
              canReport={canReport}
              disabled={isMutating}
              isMediaCopied={isImageCopied}
              mediaKind={attachmentKind ?? "image"}
              onCopyMedia={onCopyImage}
              onDelete={onDelete}
              onEdit={onStartEdit}
              onReport={onReport}
              surface={isMine ? "mine" : "default"}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
