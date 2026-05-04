import { promises as fs } from "node:fs";
import path from "node:path";
import {
  isUserPresence,
  onlinePresenceWindowMs,
  type UserPresence,
} from "@/lib/presenceTypes";

const dataDirectory = path.join(process.cwd(), ".data");
const presenceFile = path.join(dataDirectory, "presence.json");
const stalePresenceWindowMs = 1000 * 60 * 60 * 24;
let presenceMutation = Promise.resolve();

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function isFileSystemError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function readPresence() {
  try {
    const file = await fs.readFile(presenceFile, "utf8");
    const parsed: unknown = JSON.parse(file);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isUserPresence);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function writePresence(presences: UserPresence[]) {
  await fs.mkdir(dataDirectory, { recursive: true });

  const serializedPresences = JSON.stringify(presences, null, 2);
  const temporaryFile = `${presenceFile}.${process.pid}.${Date.now()}.tmp`;

  await fs.writeFile(temporaryFile, serializedPresences, "utf8");

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await fs.rename(temporaryFile, presenceFile);
      return;
    } catch (error) {
      const canRetry =
        isFileSystemError(error) &&
        (error.code === "EPERM" || error.code === "EACCES");

      if (!canRetry || attempt === 4) {
        throw error;
      }

      await wait(25 * (attempt + 1));
    }
  }
}

export async function touchPresence(username: string) {
  const nextPresence = presenceMutation.then(
    () => touchPresenceNow(username),
    () => touchPresenceNow(username),
  );

  presenceMutation = nextPresence.then(
    () => undefined,
    () => undefined,
  );

  return nextPresence;
}

async function touchPresenceNow(username: string) {
  const now = new Date();
  const staleCutoff = now.getTime() - stalePresenceWindowMs;
  const presences = await readPresence();
  const normalizedUsername = normalizeUsername(username);
  const nextPresence: UserPresence = {
    username,
    lastSeenAt: now.toISOString(),
  };
  const filteredPresences = presences.filter((presence) => {
    const lastSeenAt = new Date(presence.lastSeenAt).getTime();

    return (
      Number.isFinite(lastSeenAt) &&
      lastSeenAt >= staleCutoff &&
      normalizeUsername(presence.username) !== normalizedUsername
    );
  });

  await writePresence([nextPresence, ...filteredPresences]);

  return nextPresence;
}

export async function getOnlineUsernames(usernames: string[]) {
  const onlineCutoff = Date.now() - onlinePresenceWindowMs;
  const requestedUsernamesByKey = new Map(
    usernames.map((username) => [normalizeUsername(username), username]),
  );
  const presences = await readPresence();

  return presences
    .filter((presence) => {
      const lastSeenAt = new Date(presence.lastSeenAt).getTime();

      return (
        Number.isFinite(lastSeenAt) &&
        lastSeenAt >= onlineCutoff &&
        requestedUsernamesByKey.has(normalizeUsername(presence.username))
      );
    })
    .map(
      (presence) =>
        requestedUsernamesByKey.get(normalizeUsername(presence.username)) ??
        presence.username,
    )
    .sort((first, second) => first.localeCompare(second));
}
