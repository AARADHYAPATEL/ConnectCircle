import { promises as fs } from "node:fs";
import path from "node:path";
import { getCirclesForUser } from "@/lib/circleStore";
import { getFriendUsernames } from "@/lib/connectionStore";
import type { NewMoodEntry, SavedMoodEntry } from "@/lib/moodTypes";
import { isSavedMoodEntry } from "@/lib/moodTypes";
import {
  readTursoJsonDocument,
  shouldUseTurso,
  writeTursoJsonDocument,
} from "@/lib/tursoStore";

const dataDirectory = path.join(process.cwd(), ".data");
const moodEntryDirectory = path.join(dataDirectory, "mood-entries");

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function getMoodEntriesFile(username: string) {
  return path.join(moodEntryDirectory, `${username}.json`);
}

function getMoodEntriesDocumentKey(username: string) {
  return `mood-entries:${normalizeUsername(username)}`;
}

function cleanMoodEntries(value: unknown) {
  return Array.isArray(value)
    ? value.filter(isSavedMoodEntry).map((entry) => ({
        ...entry,
        sharedCircleIds: entry.sharedCircleIds ?? [],
        sharedWith: entry.sharedWith ?? [],
      }))
    : [];
}

async function readStoredEntries(username: string) {
  if (shouldUseTurso()) {
    return readTursoJsonDocument<SavedMoodEntry[]>(
      getMoodEntriesDocumentKey(username),
      [],
      cleanMoodEntries,
    );
  }

  const moodEntriesFile = getMoodEntriesFile(username);

  try {
    const file = await fs.readFile(moodEntriesFile, "utf8");
    const parsed: unknown = JSON.parse(file);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isSavedMoodEntry).map((entry) => ({
      ...entry,
      sharedCircleIds: entry.sharedCircleIds ?? [],
      sharedWith: entry.sharedWith ?? [],
    }));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function writeStoredEntries(username: string, entries: SavedMoodEntry[]) {
  if (shouldUseTurso()) {
    await writeTursoJsonDocument(getMoodEntriesDocumentKey(username), entries);
    return;
  }

  const moodEntriesFile = getMoodEntriesFile(username);
  await fs.mkdir(moodEntryDirectory, { recursive: true });

  const temporaryFile = `${moodEntriesFile}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(entries, null, 2), "utf8");
  await fs.rename(temporaryFile, moodEntriesFile);
}

export async function getMoodEntries(username: string) {
  return readStoredEntries(username);
}

export async function getSharedMoodEntries(username: string) {
  const [friendUsernames, circles] = await Promise.all([
    getFriendUsernames(username),
    getCirclesForUser(username),
  ]);
  const circleIds = new Set(circles.map((circle) => circle.id));
  const circleMemberUsernames = circles.flatMap(
    (circle) => circle.memberUsernames,
  );
  const candidateUsernames = Array.from(
    new Set([...friendUsernames, ...circleMemberUsernames]),
  ).filter(
    (candidateUsername) =>
      candidateUsername.toLowerCase() !== username.toLowerCase(),
  );
  const entriesByUser = await Promise.all(
    candidateUsernames.map((candidateUsername) =>
      readStoredEntries(candidateUsername),
    ),
  );

  return entriesByUser
    .flat()
    .filter((entry) =>
      entry.sharedWith.some(
        (sharedUsername) =>
          sharedUsername.toLowerCase() === username.toLowerCase(),
      ) ||
      entry.sharedCircleIds.some((circleId) => circleIds.has(circleId)),
    )
    .sort(
      (first, second) =>
        new Date(second.createdAt).getTime() -
        new Date(first.createdAt).getTime(),
    );
}

export async function getCircleMoodEntries(username: string, circleId: string) {
  const circles = await getCirclesForUser(username);
  const circle = circles.find((currentCircle) => currentCircle.id === circleId);

  if (!circle) {
    return {
      circle: null,
      entries: [],
      error: "Circle was not found.",
    };
  }

  const entriesByMember = await Promise.all(
    circle.memberUsernames.map((memberUsername) => readStoredEntries(memberUsername)),
  );
  const entries = entriesByMember
    .flat()
    .filter((entry) => entry.sharedCircleIds.includes(circle.id))
    .sort(
      (first, second) =>
        new Date(second.createdAt).getTime() -
        new Date(first.createdAt).getTime(),
    );

  return {
    circle,
    entries,
    error: "",
  };
}

export async function addMoodEntry(username: string, entry: NewMoodEntry) {
  const savedEntry: SavedMoodEntry = {
    id: crypto.randomUUID(),
    username,
    createdAt: new Date().toISOString(),
    ...entry,
    sharedCircleIds: entry.sharedCircleIds ?? [],
    sharedWith: entry.sharedWith ?? [],
  };
  const entries = await readStoredEntries(username);
  const nextEntries = [savedEntry, ...entries];

  await writeStoredEntries(username, nextEntries);

  return savedEntry;
}

export async function deleteMoodEntry(username: string, entryId: string) {
  const entries = await readStoredEntries(username);
  const nextEntries = entries.filter((entry) => entry.id !== entryId);

  if (nextEntries.length === entries.length) {
    return false;
  }

  await writeStoredEntries(username, nextEntries);

  return true;
}

export async function updateMoodEntry(
  username: string,
  entryId: string,
  entry: NewMoodEntry,
) {
  const entries = await readStoredEntries(username);
  const entryIndex = entries.findIndex(
    (currentEntry) => currentEntry.id === entryId,
  );

  if (entryIndex === -1) {
    return null;
  }

  const updatedEntry: SavedMoodEntry = {
    ...entries[entryIndex],
    ...entry,
    sharedCircleIds: entry.sharedCircleIds ?? [],
    sharedWith: entry.sharedWith ?? [],
  };
  const nextEntries = entries.map((currentEntry) =>
    currentEntry.id === entryId ? updatedEntry : currentEntry,
  );

  await writeStoredEntries(username, nextEntries);

  return updatedEntry;
}
