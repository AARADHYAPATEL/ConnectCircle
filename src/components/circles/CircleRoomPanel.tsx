"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
} from "react";
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
  type ChatMediaAttachment,
} from "@/lib/chatImageAttachments";
import {
  circleMessageLimit,
  type CircleChatThread,
  type CircleMessage,
} from "@/lib/circleTypes";
import {
  emojiShortcodeOptions,
  renderEmojiShortcodes,
  type EmojiShortcodeOption,
} from "@/lib/emojiShortcodes";
import type { SavedMoodEntry } from "@/lib/moodTypes";
import { presenceHeartbeatIntervalMs } from "@/lib/presenceTypes";

type CircleRoomPanelProps = {
  circleId: string;
  username: string;
};

type CircleMoodResponse = {
  entries: SavedMoodEntry[];
};

type CirclePresenceResponse = {
  onlineUsernames: string[];
};

type ActiveEmojiShortcode = {
  end: number;
  query: string;
  start: number;
};

function formatChatTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatPulseTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function getPulseTone(intensity: number) {
  if (intensity >= 5) {
    return {
      badge: "border-rose-100 bg-rose-50 text-rose-800",
      dot: "bg-rose-500",
      line: "bg-rose-500",
    };
  }

  if (intensity >= 4) {
    return {
      badge: "border-amber-100 bg-amber-50 text-amber-800",
      dot: "bg-amber-500",
      line: "bg-amber-500",
    };
  }

  if (intensity >= 3) {
    return {
      badge: "border-teal-100 bg-teal-50 text-teal-800",
      dot: "bg-teal-500",
      line: "bg-teal-500",
    };
  }

  return {
    badge: "border-sky-100 bg-sky-50 text-sky-800",
    dot: "bg-sky-500",
    line: "bg-sky-500",
  };
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

export function CircleRoomPanel({ circleId, username }: CircleRoomPanelProps) {
  const [thread, setThread] = useState<CircleChatThread | null>(null);
  const [moodEntries, setMoodEntries] = useState<SavedMoodEntry[]>([]);
  const [onlineUsernames, setOnlineUsernames] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [selectedImageAttachment, setSelectedImageAttachment] =
    useState<ChatMediaAttachment | null>(null);
  const [composerCursorPosition, setComposerCursorPosition] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageText, setEditingMessageText] = useState("");
  const [editingImageAttachment, setEditingImageAttachment] =
    useState<ChatMediaAttachment | null>(null);
  const [mutatingMessageId, setMutatingMessageId] = useState<string | null>(
    null,
  );
  const [isManagingCircle, setIsManagingCircle] = useState(false);
  const [roomError, setRoomError] = useState("");
  const [reportNotice, setReportNotice] = useState("");
  const [reportingMessage, setReportingMessage] =
    useState<CircleMessage | null>(null);
  const [copiedImageMessageId, setCopiedImageMessageId] = useState<
    string | null
  >(null);
  const [isChatExpanded, setIsChatExpanded] = useState(false);
  const [pulseError, setPulseError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editComposerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const copyImageResetTimeoutRef = useRef<number | null>(null);
  const [editingCursorPosition, setEditingCursorPosition] = useState(0);

  const latestPulse = moodEntries[0] ?? null;
  const earlierPulses = moodEntries.slice(1);
  const onlineCount = onlineUsernames.length;
  const trimmedMessage = message.trim();
  const trimmedEditingMessage = editingMessageText.trim();
  const renderedMessagePreview = renderEmojiShortcodes(message);
  const hasEmojiPreview = renderedMessagePreview !== message;
  const editingMessage =
    thread?.messages.find(
      (circleMessage) => circleMessage.id === editingMessageId,
    ) ?? null;
  const isCircleOwner =
    thread?.circle.ownerUsername.toLowerCase() === username.toLowerCase();
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
  const canSend =
    (trimmedMessage.length > 0 || Boolean(selectedImageAttachment)) &&
    trimmedMessage.length <= circleMessageLimit &&
    !isSending &&
    Boolean(thread);
  const canSaveEdit =
    Boolean(editingMessageId) &&
    (trimmedEditingMessage.length > 0 || Boolean(editingImageAttachment)) &&
    trimmedEditingMessage.length <= circleMessageLimit &&
    !mutatingMessageId;

  const loadRoom = useCallback(async () => {
    const [chatResponse, moodsResponse, presenceResponse] = await Promise.all([
      fetch(`/api/circles/chat?circleId=${encodeURIComponent(circleId)}`, {
        cache: "no-store",
      }),
      fetch(`/api/circles/moods?circleId=${encodeURIComponent(circleId)}`, {
        cache: "no-store",
      }),
      fetch(`/api/circles/presence?circleId=${encodeURIComponent(circleId)}`, {
        cache: "no-store",
      }),
    ]);

    if (!chatResponse.ok) {
      throw new Error(await readErrorMessage(chatResponse));
    }

    const chatData: CircleChatThread = await chatResponse.json();
    setThread(chatData);
    setRoomError("");

    if (!moodsResponse.ok) {
      setPulseError("Circle check-ins could not be loaded.");
      return;
    }

    const moodData: CircleMoodResponse = await moodsResponse.json();
    setMoodEntries(moodData.entries);
    setPulseError("");

    if (presenceResponse.ok) {
      const presenceData: CirclePresenceResponse = await presenceResponse.json();
      setOnlineUsernames(presenceData.onlineUsernames);
    }
  }, [circleId]);

  useEffect(() => {
    let isActive = true;

    async function sendPresenceHeartbeat() {
      try {
        await fetch("/api/circles/presence", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ circleId }),
        });

        if (isActive) {
          setOnlineUsernames((currentOnlineUsernames) =>
            currentOnlineUsernames.some(
              (onlineUsername) =>
                onlineUsername.toLowerCase() === username.toLowerCase(),
            )
              ? currentOnlineUsernames
              : [...currentOnlineUsernames, username],
          );
        }
      } catch {
        // Presence is a soft signal; chat should keep working if it fails.
      }
    }

    void sendPresenceHeartbeat();
    const heartbeatInterval = window.setInterval(
      sendPresenceHeartbeat,
      presenceHeartbeatIntervalMs,
    );

    return () => {
      isActive = false;
      window.clearInterval(heartbeatInterval);
    };
  }, [circleId, username]);

  useEffect(() => {
    let isActive = true;
    let hasLoadedOnce = false;

    async function refreshRoom() {
      try {
        if (!hasLoadedOnce) {
          setIsLoading(true);
        }

        await loadRoom();
        hasLoadedOnce = true;
      } catch (error) {
        if (isActive) {
          setRoomError(
            error instanceof Error
              ? error.message
              : "Circle room could not be loaded.",
          );
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void refreshRoom();
    const refreshInterval = window.setInterval(refreshRoom, 2500);

    return () => {
      isActive = false;
      window.clearInterval(refreshInterval);
    };
  }, [loadRoom]);

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
    setRoomError("");
    setReportNotice("");

    try {
      const response = await fetch("/api/circles/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          circleId,
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
      await loadRoom();
    } catch (sendError) {
      setRoomError(
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
      setRoomError("");
    } catch (pasteError) {
      setRoomError(
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
      setRoomError("");
    } catch (pasteError) {
      setRoomError(
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

  function startEditingMessage(circleMessage: CircleMessage) {
    setEditingMessageId(circleMessage.id);
    setEditingMessageText(circleMessage.message);
    setEditingImageAttachment(circleMessage.imageAttachment ?? null);
    setEditingCursorPosition(circleMessage.message.length);
    setRoomError("");
    window.requestAnimationFrame(() => {
      editComposerTextareaRef.current?.focus();
      editComposerTextareaRef.current?.setSelectionRange(
        circleMessage.message.length,
        circleMessage.message.length,
      );
    });
  }

  function cancelEditingMessage() {
    setEditingMessageId(null);
    setEditingMessageText("");
    setEditingImageAttachment(null);
    setEditingCursorPosition(0);
  }

  async function handleEditMessage(messageId: string) {
    const cleanMessage = editingMessageText.trim();

    if (
      (!cleanMessage && !editingImageAttachment) ||
      cleanMessage.length > circleMessageLimit
    ) {
      return;
    }

    setMutatingMessageId(messageId);
    setRoomError("");
    setReportNotice("");

    try {
      const response = await fetch("/api/circles/chat", {
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
      await loadRoom();
    } catch (editError) {
      setRoomError(
        editError instanceof Error
          ? editError.message
          : "Message could not be edited.",
      );
    } finally {
      setMutatingMessageId(null);
    }
  }

  async function handleDeleteMessage(circleMessage: CircleMessage) {
    const shouldDelete = window.confirm("Delete this CircleChat message?");

    if (!shouldDelete) {
      return;
    }

    setMutatingMessageId(circleMessage.id);
    setRoomError("");
    setReportNotice("");

    try {
      const response = await fetch("/api/circles/chat", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: circleMessage.id }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      if (editingMessageId === circleMessage.id) {
        cancelEditingMessage();
      }

      await loadRoom();
    } catch (deleteError) {
      setRoomError(
        deleteError instanceof Error
          ? deleteError.message
          : "Message could not be deleted.",
      );
    } finally {
      setMutatingMessageId(null);
    }
  }

  async function handleCopyMessageImage(circleMessage: CircleMessage) {
    if (!circleMessage.imageAttachment) {
      return;
    }

    setRoomError("");
    setReportNotice("");

    try {
      await copyChatMediaAttachmentToClipboard(circleMessage.imageAttachment);
      setCopiedImageMessageId(circleMessage.id);

      if (copyImageResetTimeoutRef.current) {
        window.clearTimeout(copyImageResetTimeoutRef.current);
      }

      copyImageResetTimeoutRef.current = window.setTimeout(() => {
        setCopiedImageMessageId((currentMessageId) =>
          currentMessageId === circleMessage.id ? null : currentMessageId,
        );
      }, 1600);
    } catch (copyError) {
      setRoomError(
        copyError instanceof Error
          ? copyError.message
          : "Attachment could not be copied.",
      );
    }
  }

  async function handleCircleMembershipAction(action: "delete" | "leave") {
    if (!thread) {
      return;
    }

    const isDeleting = action === "delete";
    const shouldContinue = window.confirm(
      isDeleting
        ? `Delete ${thread.circle.name}? This removes every member and CircleChat message.`
        : `Leave ${thread.circle.name}? It will be removed from your circles.`,
    );

    if (!shouldContinue) {
      return;
    }

    setIsManagingCircle(true);
    setRoomError("");
    setReportNotice("");

    try {
      const response = await fetch("/api/circles/manage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          circleId,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      window.location.href = "/circles";
    } catch (actionError) {
      setRoomError(
        actionError instanceof Error
          ? actionError.message
          : "Circle could not be updated.",
      );
      setIsManagingCircle(false);
    }
  }

  return (
    <section
      aria-labelledby="circle-room-title"
      className={`mx-auto w-full px-6 py-8 ${
        isChatExpanded ? "max-w-[96rem]" : "max-w-7xl"
      }`}
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-normal text-teal-700">
            Circle room
          </p>
          <h1
            className="mt-2 text-4xl font-bold leading-tight text-slate-950"
            id="circle-room-title"
          >
            {thread?.circle.name ?? "Circle"}
          </h1>
          <p className="mt-3 max-w-2xl leading-7 text-slate-700">
            Shared check-ins appear on the pulse board, while CircleChat keeps
            group conversation in one place.
          </p>
          {thread ? (
            <p className="mt-3 text-sm font-bold text-emerald-700">
              {onlineCount} online now
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="btn btn-primary btn-sm" href="/mood/check-in">
            Share a check-in
          </Link>
          <Link className="btn btn-secondary btn-sm" href="/circles">
            Back to circles
          </Link>
          {thread ? (
            <button
              className="btn btn-danger btn-sm"
              disabled={isManagingCircle}
              onClick={() =>
                void handleCircleMembershipAction(
                  isCircleOwner ? "delete" : "leave",
                )
              }
              type="button"
            >
              {isManagingCircle
                ? isCircleOwner
                  ? "Deleting..."
                  : "Leaving..."
                : isCircleOwner
                  ? "Delete circle"
                  : "Leave circle"}
            </button>
          ) : null}
        </div>
      </div>

      {roomError ? (
        <p className="mb-5 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900">
          {roomError}
        </p>
      ) : null}
      {reportNotice ? (
        <p className="mb-5 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
          {reportNotice}
        </p>
      ) : null}

      <div
        className={`grid gap-5 ${
          isChatExpanded ? "" : "xl:grid-cols-[minmax(0,1fr)_26rem]"
        }`}
      >
        <div className={isChatExpanded ? "hidden" : "grid gap-5"}>
          <div className="motion-panel rounded-md border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-normal text-teal-700">
                  Circle pulse
                </p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">
                  Shared check-ins appear here.
                </h2>
              </div>
              <span className="rounded-md bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700">
                {moodEntries.length}{" "}
                {moodEntries.length === 1 ? "check-in" : "check-ins"}
              </span>
            </div>

            {thread ? (
              <MemberPresenceChips
                currentUsername={username}
                memberUsernames={thread.circle.memberUsernames}
                onlineUsernames={onlineUsernames}
              />
            ) : null}

            {thread?.circle.description ? (
              <p className="mt-4 rounded-md bg-slate-50 p-4 leading-7 text-slate-700">
                {thread.circle.description}
              </p>
            ) : null}
          </div>

          {pulseError ? (
            <p className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900">
              {pulseError}
            </p>
          ) : null}

          {isLoading ? (
            <div className="rounded-md border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-600">
              Loading circle pulse...
            </div>
          ) : null}

          {!isLoading && !latestPulse ? (
            <div className="motion-panel rounded-md border border-dashed border-slate-300 bg-white p-6">
              <p className="text-sm font-semibold uppercase tracking-normal text-teal-700">
                No shared check-ins yet
              </p>
              <h2 className="mt-2 text-2xl font-bold text-slate-950">
                No one has shared a check-in with this circle yet.
              </h2>
              <p className="mt-3 max-w-2xl leading-7 text-slate-600">
                When a member shares a check-in with this circle, it will appear
                here with their support preference and note.
              </p>
              <Link className="btn btn-primary mt-5" href="/mood/check-in">
                Share the first check-in
              </Link>
            </div>
          ) : null}

          {latestPulse ? (
            <div className="grid gap-5 lg:grid-cols-[0.92fr_1.08fr]">
              <PulseFeature entry={latestPulse} />
              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-bold text-slate-950">
                    Earlier check-ins
                  </h2>
                  <p className="text-xs font-bold uppercase tracking-normal text-slate-500">
                    Live refresh
                  </p>
                </div>

                {earlierPulses.length === 0 ? (
                  <div className="rounded-md border border-dashed border-slate-300 bg-white p-5 text-sm font-semibold leading-6 text-slate-600">
                    The latest shared check-in is the only one in this room.
                  </div>
                ) : null}

                {earlierPulses.map((entry) => (
                  <PulseCard entry={entry} key={entry.id} />
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <aside
          className={`motion-panel grid grid-rows-[auto_1fr_auto] overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm ${
            isChatExpanded
              ? "h-[calc(100vh-9rem)] min-h-[44rem]"
              : "h-[calc(100vh-12rem)] min-h-[34rem] xl:sticky xl:top-4"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white p-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-normal text-teal-700">
                CircleChat
              </p>
              <h2 className="mt-1 text-xl font-bold text-slate-950">
                Group conversation
              </h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {thread
                  ? `${onlineCount} online of ${thread.circle.memberUsernames.length}`
                  : "Loading members..."}
              </p>
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

          <div className="min-h-0 overflow-y-auto bg-slate-50 p-4">
            {isLoading ? (
              <p className="text-sm font-semibold text-slate-500">
                Loading CircleChat...
              </p>
            ) : null}

            {!isLoading && thread?.messages.length === 0 ? (
              <div className="mx-auto mt-12 max-w-sm rounded-md border border-dashed border-slate-300 bg-white p-5 text-center">
                <p className="text-sm font-semibold leading-6 text-slate-600">
                  No messages yet. Reply to a check-in or start the discussion.
                </p>
              </div>
            ) : null}

            <div className="grid gap-3">
              {thread?.messages.map((circleMessage) => (
                <CircleChatBubble
                  isExpanded={isChatExpanded}
                  isMine={circleMessage.fromUsername === username}
                  isImageCopied={copiedImageMessageId === circleMessage.id}
                  isMutating={mutatingMessageId === circleMessage.id}
                  key={circleMessage.id}
                  message={circleMessage}
                  onCopyImage={() => void handleCopyMessageImage(circleMessage)}
                  onDelete={() => void handleDeleteMessage(circleMessage)}
                  onReport={() => {
                    setReportNotice("");
                    setReportingMessage(circleMessage);
                  }}
                  onStartEdit={() => startEditingMessage(circleMessage)}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <div className="border-t border-slate-200 bg-white p-4">
            {editingMessage ? (
              <>
                <div className="mb-3 rounded-md border-l-4 border-teal-500 bg-teal-50 px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-black uppercase tracking-normal text-teal-800">
                        Editing CircleChat message
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
                    className="min-h-10 flex-1 resize-none rounded-md border border-teal-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-100"
                    disabled={Boolean(mutatingMessageId)}
                    maxLength={circleMessageLimit}
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
                  onError={setRoomError}
                  tone="teal"
                />

                {editEmojiSuggestions.length > 0 ? (
                  <div className="emoji-suggestions mt-3 rounded-md border border-teal-100 bg-teal-50 p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-bold uppercase tracking-normal text-teal-800">
                        Emoji matches
                      </p>
                      {activeEditEmojiShortcode ? (
                        <p className="text-xs font-semibold text-teal-800">
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
                    {editingMessageText.length}/{circleMessageLimit}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <EmojiPicker
                    disabled={!thread || isSending}
                    onSelect={handleEmojiSelection}
                  />
                  <textarea
                    className="min-h-10 flex-1 resize-none rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-100"
                    disabled={!thread || isSending}
                    maxLength={circleMessageLimit}
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
                    placeholder="Write to this circle..."
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
                  disabled={!thread || isSending}
                  onAttachmentChange={setSelectedImageAttachment}
                  onError={setRoomError}
                  tone="teal"
                />

                {emojiSuggestions.length > 0 ? (
                  <div className="emoji-suggestions mt-3 rounded-md border border-teal-100 bg-teal-50 p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-bold uppercase tracking-normal text-teal-800">
                        Emoji matches
                      </p>
                      {activeEmojiShortcode ? (
                        <p className="text-xs font-semibold text-teal-800">
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
                    {message.length}/{circleMessageLimit}
                  </p>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
      {reportingMessage ? (
        <ReportUserDialog
          contextId={reportingMessage.id}
          contextType="circle_message"
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
          subjectLabel={`@${reportingMessage.fromUsername}'s CircleChat message`}
        />
      ) : null}
    </section>
  );
}

function PulseFeature({ entry }: { entry: SavedMoodEntry }) {
  const tone = getPulseTone(entry.intensity);

  return (
    <article className="motion-panel relative overflow-hidden rounded-md border border-slate-200 bg-white p-6 shadow-sm">
      <div className={`absolute inset-y-0 left-0 w-1.5 ${tone.line}`} />
      <p className="text-sm font-semibold uppercase tracking-normal text-slate-500">
        Latest shared check-in
      </p>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500">
            @{entry.username}
          </p>
          <h2 className="mt-1 text-3xl font-bold leading-tight text-slate-950">
            Feeling {entry.mood}
          </h2>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            {formatPulseTime(entry.createdAt)}
          </p>
        </div>
        <span
          className={`rounded-md border px-3 py-2 text-sm font-bold ${tone.badge}`}
        >
          {entry.intensity}/5
        </span>
      </div>
      <IntensityMeter intensity={entry.intensity} tone={tone.dot} />
      <p className="mt-5 text-sm font-semibold text-slate-700">
        {entry.supportNeed}
      </p>
      {entry.note ? (
        <p className="mt-3 rounded-md bg-slate-50 p-4 leading-7 text-slate-700">
          {entry.note}
        </p>
      ) : null}
    </article>
  );
}

function PulseCard({ entry }: { entry: SavedMoodEntry }) {
  const tone = getPulseTone(entry.intensity);

  return (
    <article className="motion-list-item rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-500">
            @{entry.username}
          </p>
          <h3 className="mt-1 text-xl font-bold text-slate-950">
            Feeling {entry.mood}
          </h3>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {formatPulseTime(entry.createdAt)}
          </p>
        </div>
        <span
          className={`rounded-md border px-2 py-1 text-xs font-bold ${tone.badge}`}
        >
          {entry.intensity}/5
        </span>
      </div>
      <IntensityMeter intensity={entry.intensity} tone={tone.dot} />
      <p className="mt-3 text-sm font-semibold text-slate-700">
        {entry.supportNeed}
      </p>
      {entry.note ? (
        <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm leading-6 text-slate-700">
          {entry.note}
        </p>
      ) : null}
    </article>
  );
}

function IntensityMeter({
  intensity,
  tone,
}: {
  intensity: number;
  tone: string;
}) {
  return (
    <div className="mt-5 grid grid-cols-5 gap-1" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, index) => (
        <span
          className={`h-2 rounded-full ${
            index < intensity ? tone : "bg-slate-200"
          }`}
          key={index}
        />
      ))}
    </div>
  );
}

function MemberPresenceChips({
  currentUsername,
  memberUsernames,
  onlineUsernames,
}: {
  currentUsername: string;
  memberUsernames: string[];
  onlineUsernames: string[];
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {memberUsernames.map((memberUsername) => {
        const isCurrentUser =
          memberUsername.toLowerCase() === currentUsername.toLowerCase();
        const isOnline = onlineUsernames.some(
          (onlineUsername) =>
            onlineUsername.toLowerCase() === memberUsername.toLowerCase(),
        );

        return (
          <span
            className={`inline-flex items-center gap-2 rounded-md px-2 py-1 text-xs font-bold ${
              isOnline
                ? "bg-emerald-50 text-emerald-800"
                : isCurrentUser
                  ? "bg-teal-100 text-teal-900"
                  : "bg-slate-100 text-slate-700"
            }`}
            key={memberUsername}
            title={isOnline ? "Online now" : "Offline"}
          >
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${
                isOnline ? "bg-emerald-500" : "bg-slate-300"
              }`}
            />
            @{memberUsername}
          </span>
        );
      })}
    </div>
  );
}

function CircleChatBubble({
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
  message: CircleMessage;
  onCopyImage: () => void;
  onDelete: () => void;
  onReport: () => void;
  onStartEdit: () => void;
}) {
  const bubbleWidthClass = isExpanded
    ? "max-w-[92%] sm:max-w-[34rem] lg:max-w-[44rem]"
    : "max-w-[88%]";
  const canReport = !isMine;
  const hasActions = Boolean(message.imageAttachment) || isMine || canReport;
  const attachmentKind = message.imageAttachment
    ? getChatMediaAttachmentKind(message.imageAttachment)
    : null;

  return (
    <div
      className={`chat-bubble relative focus-within:z-10 flex ${
        isMine ? "chat-bubble-mine justify-end" : "justify-start"
      }`}
    >
      <div
        className={`${bubbleWidthClass} rounded-md px-4 py-3 shadow-sm ${
          isMine
            ? "bg-teal-700 text-white"
            : "border border-slate-200 bg-white text-slate-900"
        }`}
      >
        {!isMine ? (
          <p className="mb-1 text-xs font-bold text-teal-700">
            @{message.fromUsername}
          </p>
        ) : null}
        {message.imageAttachment && attachmentKind === "video" ? (
          <video
            aria-label={message.imageAttachment.name}
            className={`mb-3 block max-w-full rounded-md border ${
              isExpanded ? "max-h-72" : "max-h-52"
            } ${isMine ? "border-white/20" : "border-slate-200"}`}
            controls
            playsInline
            preload="metadata"
            src={message.imageAttachment.dataUrl}
          />
        ) : null}
        {message.imageAttachment && attachmentKind === "image" ? (
          <a
            aria-label={`Open ${message.imageAttachment.name}`}
            className="mb-3 block outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            href={message.imageAttachment.dataUrl}
            rel="noreferrer"
            target="_blank"
          >
            <img
              alt={message.imageAttachment.name}
              className={`block max-w-full rounded-md border ${
                isExpanded ? "max-h-64" : "max-h-48"
              } ${isMine ? "border-white/20" : "border-slate-200"}`}
              src={message.imageAttachment.dataUrl}
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
            isMine ? "text-teal-50" : "text-slate-500"
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
