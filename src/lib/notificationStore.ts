import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getChatOverview } from "@/lib/chatStore";
import { getCircleSummaryForUser } from "@/lib/circleStore";
import { getConnectionSummary } from "@/lib/connectionStore";
import { getSharedMoodEntries } from "@/lib/moodEntryStore";
import { getSupportMessageSummary } from "@/lib/supportMessageStore";
import {
  getTursoClient,
  readTursoJsonDocument,
  shouldUseTurso,
} from "@/lib/tursoStore";
import { tursoRowNumber, tursoRowString } from "@/lib/tursoRow";
import type { AppNotification, NotificationSummary } from "@/lib/notificationTypes";

const dataDirectory = path.join(process.cwd(), ".data");
const notificationStateFile = path.join(dataDirectory, "notification-state.json");
const notificationStatesTable = "connectcircle_notification_states";
const tursoNotificationStateDocumentKey = "notification-state";
const visibleNotificationLimit = 14;

let hasEnsuredTursoNotificationStatesSchema = false;
let hasBackfilledTursoNotificationStates = false;

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

function validateNotificationStatesDocument(value: unknown) {
  return Array.isArray(value) ? value.filter(isNotificationState) : [];
}

async function ensureTursoNotificationStatesSchema() {
  if (hasEnsuredTursoNotificationStatesSchema) {
    return;
  }

  await getTursoClient().executeMultiple(`
    CREATE TABLE IF NOT EXISTS ${notificationStatesTable} (
      username_key TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS connectcircle_notification_states_seen_idx
      ON ${notificationStatesTable} (last_seen_at);
  `);

  hasEnsuredTursoNotificationStatesSchema = true;
}

async function countTursoNotificationStates() {
  await ensureTursoNotificationStatesSchema();

  const result = await getTursoClient().execute(
    `SELECT COUNT(*) AS count FROM ${notificationStatesTable}`,
  );
  const row = result.rows[0];

  return row ? tursoRowNumber(row, "count") : 0;
}

function rowToNotificationState(row: { [key: string]: unknown }) {
  const state = {
    username: String(row.username ?? ""),
    lastSeenAt: String(row.last_seen_at ?? ""),
  };

  return isNotificationState(state) ? state : null;
}

async function upsertTursoNotificationState(state: NotificationState) {
  await ensureTursoNotificationStatesSchema();

  await getTursoClient().execute({
    sql: `
      INSERT INTO ${notificationStatesTable} (
        username_key,
        username,
        last_seen_at,
        updated_at
      )
      VALUES (?, ?, ?, ?)
      ON CONFLICT(username_key) DO UPDATE SET
        username = excluded.username,
        last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at
    `,
    args: [
      normalizeUsername(state.username),
      state.username,
      state.lastSeenAt,
      new Date().toISOString(),
    ],
  });
}

async function backfillTursoNotificationStatesFromLegacyDocument() {
  if (hasBackfilledTursoNotificationStates) {
    return;
  }

  if ((await countTursoNotificationStates()) > 0) {
    hasBackfilledTursoNotificationStates = true;
    return;
  }

  const legacyStates = await readTursoJsonDocument<NotificationState[]>(
    tursoNotificationStateDocumentKey,
    [],
    validateNotificationStatesDocument,
  );

  for (const state of legacyStates) {
    await upsertTursoNotificationState(state);
  }

  hasBackfilledTursoNotificationStates = true;
}

async function readTursoNotificationStates() {
  await ensureTursoNotificationStatesSchema();
  await backfillTursoNotificationStatesFromLegacyDocument();

  const result = await getTursoClient().execute({
    sql: `
      SELECT username, last_seen_at
      FROM ${notificationStatesTable}
      ORDER BY last_seen_at DESC
    `,
    args: [],
  });

  return result.rows
    .map(rowToNotificationState)
    .filter((state): state is NotificationState => Boolean(state));
}

async function findTursoNotificationState(username: string) {
  await ensureTursoNotificationStatesSchema();
  await backfillTursoNotificationStatesFromLegacyDocument();

  const result = await getTursoClient().execute({
    sql: `
      SELECT username, last_seen_at
      FROM ${notificationStatesTable}
      WHERE username_key = ?
      LIMIT 1
    `,
    args: [normalizeUsername(username)],
  });
  const row = result.rows[0];

  return row ? rowToNotificationState(row) : null;
}

async function syncTursoNotificationStates(states: NotificationState[]) {
  await ensureTursoNotificationStatesSchema();
  await backfillTursoNotificationStatesFromLegacyDocument();

  const nextStateKeys = new Set(
    states.map((state) => normalizeUsername(state.username)),
  );
  const existingRows = await getTursoClient().execute({
    sql: `SELECT username_key FROM ${notificationStatesTable}`,
    args: [],
  });

  for (const row of existingRows.rows) {
    const usernameKey = tursoRowString(row, "username_key");

    if (usernameKey && !nextStateKeys.has(usernameKey)) {
      await getTursoClient().execute({
        sql: `DELETE FROM ${notificationStatesTable} WHERE username_key = ?`,
        args: [usernameKey],
      });
    }
  }

  for (const state of states) {
    await upsertTursoNotificationState(state);
  }
}

async function getNotificationState(username: string) {
  if (shouldUseTurso()) {
    return findTursoNotificationState(username);
  }

  const states = await readNotificationStates();

  return (
    states.find((currentState) =>
      areSameUser(currentState.username, username),
    ) ?? null
  );
}

async function readNotificationStates() {
  if (shouldUseTurso()) {
    return readTursoNotificationStates();
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
    await syncTursoNotificationStates(states);
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
    state,
  ] = await Promise.all([
    getChatOverview(username),
    getCircleSummaryForUser(username),
    getConnectionSummary(username),
    getSharedMoodEntries(username),
    getSupportMessageSummary(username),
    getNotificationState(username),
  ]);
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
  if (shouldUseTurso()) {
    const now = new Date().toISOString();

    await ensureTursoNotificationStatesSchema();
    await backfillTursoNotificationStatesFromLegacyDocument();
    await upsertTursoNotificationState({ username, lastSeenAt: now });

    return now;
  }

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
