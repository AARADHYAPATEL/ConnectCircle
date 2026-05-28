import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Row as TursoRow } from "@libsql/client";
import type { PublicUser } from "@/lib/authStore";
import { getClientIp, getUserAgent } from "@/lib/requestIdentity";
import {
  getTursoClient,
  readTursoJsonDocument,
  shouldUseTurso,
} from "@/lib/tursoStore";
import {
  tursoRowNumber,
  tursoRowOptionalString,
  tursoRowString,
} from "@/lib/tursoRow";

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
const userNetworkTable = "connectcircle_user_network";
const tursoUserNetworkDocumentKey = "user-network";
const networkRefreshIntervalMs = 15 * 60 * 1000;

let hasEnsuredTursoUserNetworkSchema = false;
let hasBackfilledTursoUserNetwork = false;

type RecordUserNetworkAccessInput = {
  lastIp: string;
  lastUserAgent?: string;
};

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

function rowToUserNetworkRecord(row: TursoRow) {
  const lastUserAgent = tursoRowOptionalString(row, "last_user_agent");
  const record = {
    id: tursoRowString(row, "id"),
    userId: tursoRowString(row, "user_id"),
    username: tursoRowString(row, "username"),
    usernameKey: tursoRowString(row, "username_key"),
    lastIp: tursoRowString(row, "last_ip"),
    lastSeenAt: tursoRowString(row, "last_seen_at"),
    ...(lastUserAgent ? { lastUserAgent } : {}),
  };

  return isUserNetworkRecord(record) ? record : null;
}

async function ensureTursoUserNetworkSchema() {
  if (hasEnsuredTursoUserNetworkSchema) {
    return;
  }

  await getTursoClient().executeMultiple(`
    CREATE TABLE IF NOT EXISTS ${userNetworkTable} (
      username_key TEXT PRIMARY KEY,
      id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      last_ip TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      last_user_agent TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS connectcircle_user_network_id_unique
      ON ${userNetworkTable} (id);

    CREATE INDEX IF NOT EXISTS connectcircle_user_network_user_id_idx
      ON ${userNetworkTable} (user_id);

    CREATE INDEX IF NOT EXISTS connectcircle_user_network_last_ip_idx
      ON ${userNetworkTable} (last_ip);

    CREATE INDEX IF NOT EXISTS connectcircle_user_network_seen_idx
      ON ${userNetworkTable} (last_seen_at);
  `);

  hasEnsuredTursoUserNetworkSchema = true;
}

async function countTursoUserNetworkRecords() {
  await ensureTursoUserNetworkSchema();

  const result = await getTursoClient().execute(
    `SELECT COUNT(*) AS count FROM ${userNetworkTable}`,
  );
  const row = result.rows[0];

  return row ? tursoRowNumber(row, "count") : 0;
}

async function upsertTursoUserNetworkRecord(record: UserNetworkRecord) {
  await ensureTursoUserNetworkSchema();

  await getTursoClient().execute({
    sql: `
      DELETE FROM ${userNetworkTable}
      WHERE user_id = ? AND username_key <> ?
    `,
    args: [record.userId, record.usernameKey],
  });

  await getTursoClient().execute({
    sql: `
      INSERT INTO ${userNetworkTable} (
        username_key,
        id,
        user_id,
        username,
        last_ip,
        last_seen_at,
        last_user_agent,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(username_key) DO UPDATE SET
        id = excluded.id,
        user_id = excluded.user_id,
        username = excluded.username,
        last_ip = excluded.last_ip,
        last_seen_at = excluded.last_seen_at,
        last_user_agent = excluded.last_user_agent,
        updated_at = excluded.updated_at
    `,
    args: [
      record.usernameKey,
      record.id,
      record.userId,
      record.username,
      record.lastIp,
      record.lastSeenAt,
      record.lastUserAgent ?? null,
      new Date().toISOString(),
    ],
  });
}

async function backfillTursoUserNetworkFromLegacyDocument() {
  if (hasBackfilledTursoUserNetwork) {
    return;
  }

  if ((await countTursoUserNetworkRecords()) > 0) {
    hasBackfilledTursoUserNetwork = true;
    return;
  }

  const legacyRecords = await readTursoJsonDocument<UserNetworkRecord[]>(
    tursoUserNetworkDocumentKey,
    [],
    validateUserNetworkRecords,
  );

  for (const record of legacyRecords) {
    await upsertTursoUserNetworkRecord(record);
  }

  hasBackfilledTursoUserNetwork = true;
}

async function readTursoUserNetworkRecords() {
  await ensureTursoUserNetworkSchema();
  await backfillTursoUserNetworkFromLegacyDocument();

  const result = await getTursoClient().execute({
    sql: `
      SELECT
        username_key,
        id,
        user_id,
        username,
        last_ip,
        last_seen_at,
        last_user_agent
      FROM ${userNetworkTable}
      ORDER BY last_seen_at DESC
    `,
    args: [],
  });

  return result.rows
    .map(rowToUserNetworkRecord)
    .filter((record): record is UserNetworkRecord => Boolean(record));
}

async function findTursoUserNetworkRecord(
  userId: string,
  usernameKey: string,
) {
  await ensureTursoUserNetworkSchema();
  await backfillTursoUserNetworkFromLegacyDocument();

  const result = await getTursoClient().execute({
    sql: `
      SELECT
        username_key,
        id,
        user_id,
        username,
        last_ip,
        last_seen_at,
        last_user_agent
      FROM ${userNetworkTable}
      WHERE user_id = ? OR username_key = ?
      ORDER BY last_seen_at DESC
      LIMIT 1
    `,
    args: [userId, usernameKey],
  });
  const row = result.rows[0];

  return row ? rowToUserNetworkRecord(row) : null;
}

async function findTursoUserNetworkRecordByUsernameKey(usernameKey: string) {
  await ensureTursoUserNetworkSchema();
  await backfillTursoUserNetworkFromLegacyDocument();

  const result = await getTursoClient().execute({
    sql: `
      SELECT
        username_key,
        id,
        user_id,
        username,
        last_ip,
        last_seen_at,
        last_user_agent
      FROM ${userNetworkTable}
      WHERE username_key = ?
      LIMIT 1
    `,
    args: [usernameKey],
  });
  const row = result.rows[0];

  return row ? rowToUserNetworkRecord(row) : null;
}

async function syncTursoUserNetworkRecords(records: UserNetworkRecord[]) {
  await ensureTursoUserNetworkSchema();
  await backfillTursoUserNetworkFromLegacyDocument();

  const nextRecordKeys = new Set(records.map((record) => record.usernameKey));
  const existingRows = await getTursoClient().execute({
    sql: `SELECT username_key FROM ${userNetworkTable}`,
    args: [],
  });

  for (const row of existingRows.rows) {
    const usernameKey = tursoRowString(row, "username_key");

    if (usernameKey && !nextRecordKeys.has(usernameKey)) {
      await getTursoClient().execute({
        sql: `DELETE FROM ${userNetworkTable} WHERE username_key = ?`,
        args: [usernameKey],
      });
    }
  }

  for (const record of records) {
    await upsertTursoUserNetworkRecord(record);
  }
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
    return readTursoUserNetworkRecords();
  }

  return readJsonUserNetworkRecords();
}

async function writeUserNetworkRecords(records: UserNetworkRecord[]) {
  if (shouldUseTurso()) {
    await syncTursoUserNetworkRecords(records);
    return;
  }

  await writeJsonUserNetworkRecords(records);
}

function shouldSkipNetworkWrite(
  existingRecord: UserNetworkRecord | undefined,
  lastIp: string,
  lastUserAgent: string,
) {
  if (!existingRecord) {
    return false;
  }

  const lastSeenAt = new Date(existingRecord.lastSeenAt).getTime();
  const isFresh = Date.now() - lastSeenAt < networkRefreshIntervalMs;

  return (
    isFresh &&
    existingRecord.lastIp === lastIp &&
    (existingRecord.lastUserAgent ?? "") === lastUserAgent
  );
}

export async function recordUserNetworkAccessDetails(
  user: PublicUser,
  { lastIp, lastUserAgent = "" }: RecordUserNetworkAccessInput,
) {
  if (!lastIp) {
    return null;
  }

  const usernameKey = normalizeUsernameKey(user.username);

  if (shouldUseTurso()) {
    const existingRecord = await findTursoUserNetworkRecord(user.id, usernameKey);

    if (shouldSkipNetworkWrite(existingRecord ?? undefined, lastIp, lastUserAgent)) {
      return existingRecord ?? null;
    }

    const nextRecord: UserNetworkRecord = {
      id: existingRecord?.id ?? randomUUID(),
      lastIp,
      lastSeenAt: new Date().toISOString(),
      userId: user.id,
      username: user.username,
      usernameKey,
      ...(lastUserAgent
        ? { lastUserAgent }
        : existingRecord?.lastUserAgent
          ? { lastUserAgent: existingRecord.lastUserAgent }
          : {}),
    };

    await upsertTursoUserNetworkRecord(nextRecord);

    return nextRecord;
  }

  const records = await readUserNetworkRecords();
  const existingRecord = records.find(
    (record) => record.userId === user.id || record.usernameKey === usernameKey,
  );

  if (shouldSkipNetworkWrite(existingRecord, lastIp, lastUserAgent)) {
    return existingRecord ?? null;
  }

  const nextRecord: UserNetworkRecord = {
    id: existingRecord?.id ?? randomUUID(),
    lastIp,
    lastSeenAt: new Date().toISOString(),
    userId: user.id,
    username: user.username,
    usernameKey,
    ...(lastUserAgent
      ? { lastUserAgent }
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

export async function recordUserNetworkAccess(
  user: PublicUser,
  request: Request,
) {
  return recordUserNetworkAccessDetails(user, {
    lastIp: getClientIp(request),
    lastUserAgent: getUserAgent(request),
  });
}

export async function getUserNetworkRecordByUsername(username: string) {
  const usernameKey = normalizeUsernameKey(username);

  if (shouldUseTurso()) {
    return findTursoUserNetworkRecordByUsernameKey(usernameKey);
  }

  const records = await readUserNetworkRecords();

  return (
    records.find((record) => record.usernameKey === usernameKey) ?? null
  );
}
