import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { PublicUser } from "@/lib/authStore";
import { getClientIp, getUserAgent } from "@/lib/requestIdentity";
import {
  readTursoJsonDocument,
  shouldUseTurso,
  writeTursoJsonDocument,
} from "@/lib/tursoStore";

export type UserNetworkRecord = {
  id: string;
  lastIp: string;
  lastSeenAt: string;
  lastUserAgent?: string;
  userId: string;
  username: string;
  usernameKey: string;
};

const dataDirectory = path.join(process.cwd(), ".data");
const userNetworkFile = path.join(dataDirectory, "user-network.json");
const tursoUserNetworkDocumentKey = "user-network";

function normalizeUsernameKey(username: string) {
  return username.trim().toLowerCase();
}

function isUserNetworkRecord(value: unknown): value is UserNetworkRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Partial<UserNetworkRecord>;

  return (
    typeof record.id === "string" &&
    typeof record.userId === "string" &&
    typeof record.username === "string" &&
    typeof record.usernameKey === "string" &&
    typeof record.lastIp === "string" &&
    typeof record.lastSeenAt === "string" &&
    (typeof record.lastUserAgent === "undefined" ||
      typeof record.lastUserAgent === "string")
  );
}

function validateUserNetworkRecords(value: unknown) {
  return Array.isArray(value) ? value.filter(isUserNetworkRecord) : [];
}

async function readJsonUserNetworkRecords() {
  try {
    const file = await fs.readFile(userNetworkFile, "utf8");
    const parsed: unknown = JSON.parse(file);

    return validateUserNetworkRecords(parsed);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function writeJsonUserNetworkRecords(records: UserNetworkRecord[]) {
  await fs.mkdir(dataDirectory, { recursive: true });

  const temporaryFile = `${userNetworkFile}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(records, null, 2), "utf8");
  await fs.rename(temporaryFile, userNetworkFile);
}

async function readUserNetworkRecords() {
  if (shouldUseTurso()) {
    return readTursoJsonDocument<UserNetworkRecord[]>(
      tursoUserNetworkDocumentKey,
      [],
      validateUserNetworkRecords,
    );
  }

  return readJsonUserNetworkRecords();
}

async function writeUserNetworkRecords(records: UserNetworkRecord[]) {
  if (shouldUseTurso()) {
    await writeTursoJsonDocument(tursoUserNetworkDocumentKey, records);
    return;
  }

  await writeJsonUserNetworkRecords(records);
}

export async function recordUserNetworkAccess(
  user: PublicUser,
  request: Request,
) {
  const lastIp = getClientIp(request);

  if (!lastIp) {
    return null;
  }

  const records = await readUserNetworkRecords();
  const usernameKey = normalizeUsernameKey(user.username);
  const existingRecord = records.find(
    (record) => record.userId === user.id || record.usernameKey === usernameKey,
  );
  const nextRecord: UserNetworkRecord = {
    id: existingRecord?.id ?? randomUUID(),
    lastIp,
    lastSeenAt: new Date().toISOString(),
    userId: user.id,
    username: user.username,
    usernameKey,
    ...(getUserAgent(request)
      ? { lastUserAgent: getUserAgent(request) }
      : existingRecord?.lastUserAgent
        ? { lastUserAgent: existingRecord.lastUserAgent }
        : {}),
  };

  await writeUserNetworkRecords([
    nextRecord,
    ...records.filter((record) => record.id !== nextRecord.id),
  ]);

  return nextRecord;
}

export async function getUserNetworkRecordByUsername(username: string) {
  const usernameKey = normalizeUsernameKey(username);
  const records = await readUserNetworkRecords();

  return (
    records.find((record) => record.usernameKey === usernameKey) ?? null
  );
}
