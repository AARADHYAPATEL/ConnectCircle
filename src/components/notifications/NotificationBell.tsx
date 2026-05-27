"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AppNotification,
  NotificationSummary,
  NotificationTone,
} from "@/lib/notificationTypes";

type NotificationBellProps = {
  summary: NotificationSummary;
};

const toneStyles: Record<
  NotificationTone,
  { accent: string; icon: string; label: string }
> = {
  circle: {
    accent: "bg-indigo-100 text-indigo-700",
    icon: "C",
    label: "Circle",
  },
  connection: {
    accent: "bg-rose-100 text-rose-700",
    icon: "R",
    label: "Request",
  },
  message: {
    accent: "bg-sky-100 text-sky-700",
    icon: "M",
    label: "Message",
  },
  mood: {
    accent: "bg-teal-100 text-teal-700",
    icon: "F",
    label: "Feeling",
  },
  support: {
    accent: "bg-amber-100 text-amber-700",
    icon: "N",
    label: "Note",
  },
};

function formatNotificationTime(createdAt: string, now: number | null) {
  if (!now) {
    return "";
  }

  const timestamp = new Date(createdAt).getTime();

  if (Number.isNaN(timestamp)) {
    return "";
  }

  const elapsedMilliseconds = now - timestamp;
  const elapsedMinutes = Math.max(1, Math.floor(elapsedMilliseconds / 60000));

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);

  if (elapsedHours < 24) {
    return `${elapsedHours}h`;
  }

  return `${Math.floor(elapsedHours / 24)}d`;
}

function BellIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M15 17H9m9-6a6 6 0 0 0-12 0c0 2.6-.7 4.3-1.6 5.4-.6.8-.1 1.6.8 1.6h13.6c.9 0 1.4-.9.8-1.6C18.7 15.3 18 13.6 18 11Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M10 20a2.1 2.1 0 0 0 4 0"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function NotificationItem({
  notification,
  now,
  onSelect,
}: {
  now: number | null;
  notification: AppNotification;
  onSelect: () => void;
}) {
  const tone = toneStyles[notification.tone];

  return (
    <Link
      className="group grid grid-cols-[2rem_1fr_auto] gap-3 rounded-md border border-transparent p-3 transition hover:border-slate-200 hover:bg-slate-50"
      href={notification.href}
      onClick={onSelect}
    >
      <span
        aria-hidden="true"
        className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black ${tone.accent}`}
      >
        {tone.icon}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-black text-slate-950">
            {notification.title}
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.65rem] font-black uppercase tracking-[0.12em] text-slate-500">
            {tone.label}
          </span>
        </span>
        <span className="mt-1 block text-sm font-semibold leading-5 text-slate-600">
          {notification.body}
        </span>
      </span>
      <span className="pt-0.5 text-xs font-black text-slate-400">
        {formatNotificationTime(notification.createdAt, now)}
      </span>
    </Link>
  );
}

export function NotificationBell({ summary }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [notifications, setNotifications] = useState(summary.notifications);
  const [unreadCount, setUnreadCount] = useState(summary.unreadCount);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasNotifications = notifications.length > 0;
  const hasUnread = unreadCount > 0;
  const trayTitle = useMemo(() => {
    if (!hasNotifications) {
      return "No new updates";
    }

    if (!hasUnread) {
      return "You are up to date";
    }

    return `${unreadCount} new ${unreadCount === 1 ? "update" : "updates"}`;
  }, [hasNotifications, hasUnread, unreadCount]);

  useEffect(() => {
    const refreshTime = () => {
      setNow(Date.now());
    };
    const refreshNotifications = async () => {
      const response = await fetch("/api/notifications", {
        cache: "no-store",
      }).catch(() => null);

      if (!response?.ok) {
        return;
      }

      const nextSummary = (await response.json()) as NotificationSummary;
      setNotifications(nextSummary.notifications);
      setUnreadCount(nextSummary.unreadCount);
    };

    const timeoutId = window.setTimeout(refreshTime, 0);
    const intervalId = window.setInterval(refreshTime, 60000);
    const notificationIntervalId = window.setInterval(
      refreshNotifications,
      120000,
    );

    function handlePointerDown(event: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
      window.clearInterval(notificationIntervalId);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  async function openTray() {
    const nextOpenState = !isOpen;
    setIsOpen(nextOpenState);

    if (!nextOpenState || !hasUnread) {
      return;
    }

    setUnreadCount(0);

    await fetch("/api/notifications/read", {
      method: "POST",
    }).catch(() => {
      setUnreadCount(summary.unreadCount);
    });
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={isOpen}
        aria-label={`Notifications${
          unreadCount > 0 ? `, ${unreadCount} unread` : ""
        }`}
        className={`relative flex h-10 w-10 items-center justify-center rounded-full border text-slate-600 shadow-sm transition ${
          isOpen
            ? "border-teal-300 bg-teal-50 text-teal-800"
            : "border-slate-200 bg-white/80 hover:border-slate-300 hover:bg-white hover:text-slate-950"
        }`}
        onClick={openTray}
        type="button"
      >
        <BellIcon />
        {hasUnread ? (
          <span className="absolute right-2 top-2 flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" />
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div className="absolute right-0 z-[1001] mt-3 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl shadow-slate-950/10">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-black text-slate-950">{trayTitle}</p>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">
                  Messages, invitations, shared check-ins, notes, and circles.
                </p>
              </div>
              {hasUnread ? (
                <span className="rounded-full bg-rose-500 px-2.5 py-1 text-xs font-black text-white shadow-sm">
                  {unreadCount}
                </span>
              ) : null}
            </div>
          </div>

          {hasNotifications ? (
            <div className="max-h-[24rem] overflow-y-auto p-2">
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  now={now}
                  notification={notification}
                  onSelect={() => setIsOpen(false)}
                />
              ))}
            </div>
          ) : (
            <div className="px-5 py-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                <BellIcon />
              </div>
              <p className="mt-4 text-sm font-black text-slate-950">
                No updates yet
              </p>
              <p className="mx-auto mt-2 max-w-56 text-sm font-semibold leading-6 text-slate-500">
                When someone reaches out, shares a check-in, or adds you to a
                circle, it will appear here.
              </p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
