import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getChatOverview } from "@/lib/chatStore";
import { getCircleSummaryForUser } from "@/lib/circleStore";
import { getConnectionSummary } from "@/lib/connectionStore";
import { getSharedMoodEntries } from "@/lib/moodEntryStore";
import { getSupportMessageSummary } from "@/lib/supportMessageStore";
import {
  readTursoJsonDocument,
  shouldUseTurso,
  writeTursoJsonDocument,
} from "@/lib/tursoStore";
import type { AppNotification, NotificationSummary } from "@/lib/notificationTypes";

const dataDirectory = path.join(process.cwd(), ".data");
const notificationStateFile = path.join(dataDirectory, "notification-state.json");
const tursoNotificationStateDocumentKey = "notification-state";
const visibleNotificationLimit = 14;

type NotificationState = {
  lastSeenAt: string;
  username: string;
};

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function areSameUser(firstUsername: string, secondUsername: string) {
  return normalizeUsername(firstUsername) === normalizeUsername(secondUsername);
}

function isNotificationState(value: unknown): value is NotificationState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const state = value as Partial<NotificationState>;

  return (
    typeof state.username === "string" &&
    typeof state.lastSeenAt === "string"
  );
}

async function readNotificationStates() {
  if (shouldUseTurso()) {
    return readTursoJsonDocument<NotificationState[]>(
      tursoNotificationStateDocumentKey,
      [],
      (value) =>
        Array.isArray(value) ? value.filter(isNotificationState) : [],
    );
  }

  try {
    const file = await fs.readFile(notificationStateFile, "utf8");
    const parsed: unknown = JSON.parse(file);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isNotificationState);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function wait(milliseconds: number) {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function writeNotificationStates(states: NotificationState[]) {
  if (shouldUseTurso()) {
    await writeTursoJsonDocument(tursoNotificationStateDocumentKey, states);
    return;
  }

  await fs.mkdir(dataDirectory, { recursive: true });

  const temporaryFile = `${notificationStateFile}.${randomUUID()}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(states, null, 2), "utf8");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await fs.rename(temporaryFile, notificationStateFile);
      return;
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error.code === "EPERM" || error.code === "EBUSY") &&
        attempt < 3
      ) {
        await wait(60 * (attempt + 1));
        continue;
      }

      await fs.unlink(temporaryFile).catch(() => {});
      throw error;
    }
  }
}

function sortNotifications(notifications: AppNotification[]) {
  return [...notifications].sort(
    (first, second) =>
      new Date(second.createdAt).getTime() -
      new Date(first.createdAt).getTime(),
  );
}

function preview(text: string, fallback: string) {
  const cleanText = text.trim();

  if (!cleanText) {
    return fallback;
  }

  return cleanText.length > 82 ? `${cleanText.slice(0, 79)}...` : cleanText;
}

function isUnread(notification: AppNotification, lastSeenAt: string | null) {
  if (!lastSeenAt) {
    return true;
  }

  return new Date(notification.createdAt).getTime() > new Date(lastSeenAt).getTime();
}

export async function getNotificationSummary(
  username: string,
): Promise<NotificationSummary> {
  const [
    chatOverview,
    circleSummary,
    connectionSummary,
    sharedMoodEntries,
    supportSummary,
    states,
  ] = await Promise.all([
    getChatOverview(username),
    getCircleSummaryForUser(username),
    getConnectionSummary(username),
    getSharedMoodEntries(username),
    getSupportMessageSummary(username),
    readNotificationStates(),
  ]);
  const state = states.find((currentState) =>
    areSameUser(currentState.username, username),
  );
  const notifications: AppNotification[] = [
    ...connectionSummary.incomingRequests.map((request) => ({
      id: `connection:${request.id}`,
      tone: "connection" as const,
      title: "Connection invitation",
      body: `@${request.fromUsername} sent you a connection invitation.`,
      href: "/social/connections",
      createdAt: request.createdAt,
    })),
    ...chatOverview.conversations
      .filter(
        (conversation) =>
          conversation.lastMessage &&
          !areSameUser(conversation.lastMessage.fromUsername, username),
      )
      .map((conversation) => ({
        id: `message:${conversation.lastMessage?.id ?? conversation.friendUsername}`,
        tone: "message" as const,
        title: "New message",
        body: `@${conversation.friendUsername}: ${preview(
          conversation.lastMessage?.message ?? "",
          "Sent you a message.",
        )}`,
        href: "/social/chat",
        createdAt: conversation.lastMessage?.createdAt ?? new Date(0).toISOString(),
      })),
    ...supportSummary.receivedMessages.map((message) => ({
      id: `support:${message.id}`,
      tone: "support" as const,
      title: "Support note",
      body: `@${message.fromUsername}: ${preview(
        message.message,
        "Shared a supportive note.",
      )}`,
      href: "/social/support",
      createdAt: message.createdAt,
    })),
    ...sharedMoodEntries.map((entry) => ({
      id: `mood:${entry.id}`,
      tone: "mood" as const,
      title: "Check-in shared",
      body: `@${entry.username} shared feeling ${entry.mood.toLowerCase()}.`,
      href: "/social/feed",
      createdAt: entry.createdAt,
    })),
    ...circleSummary.incomingJoinRequests.map((request) => ({
      id: `circle-request:${request.id}`,
      tone: "circle" as const,
      title: "Circle invitation request",
      body: `@${request.fromUsername} wants to join ${request.circle.name}.`,
      href: "/circles",
      createdAt: request.createdAt,
    })),
    ...circleSummary.circles
      .filter((circle) => !areSameUser(circle.ownerUsername, username))
      .map((circle) => ({
        id: `circle:${circle.id}`,
        tone: "circle" as const,
      title: "Circle joined",
        body: `You are now part of ${circle.name}.`,
        href: `/circles/${circle.id}`,
        createdAt: circle.createdAt,
      })),
  ];
  const sortedNotifications = sortNotifications(notifications).slice(
    0,
    visibleNotificationLimit,
  );

  return {
    lastSeenAt: state?.lastSeenAt ?? null,
    notifications: sortedNotifications,
    unreadCount: sortedNotifications.filter((notification) =>
      isUnread(notification, state?.lastSeenAt ?? null),
    ).length,
  };
}

export async function markNotificationsRead(username: string) {
  const states = await readNotificationStates();
  const now = new Date().toISOString();
  const existingState = states.find((state) =>
    areSameUser(state.username, username),
  );
  const nextStates = existingState
    ? states.map((state) =>
        areSameUser(state.username, username)
          ? { ...state, lastSeenAt: now }
          : state,
      )
    : [{ username, lastSeenAt: now }, ...states];

  await writeNotificationStates(nextStates);

  return now;
}
