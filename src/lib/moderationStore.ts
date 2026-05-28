import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Row as TursoRow } from "@libsql/client";
import {
  getModerationActionLabel,
  isModerationActionType,
  type ModerationActionType,
  type ModerationRecord,
} from "@/lib/moderationTypes";
import { normalizeClientIp } from "@/lib/requestIdentity";
import {
  compressedTursoBlobToJson,
  getTursoClient,
  readTursoJsonDocument,
  shouldUseTurso,
  valueToCompressedTursoBlob,
} from "@/lib/tursoStore";
import { tursoRowNumber, tursoRowString } from "@/lib/tursoRow";

export type CreateModerationRecordInput = {
  createdBy: string;
  expiresAt?: string;
  note?: string;
  reason: string;
  reportId?: string;
  targetIp?: string;
  targetUserId?: string;
  targetUsername?: string;
  type: ModerationActionType;
};

export type ModerationBlock = {
  message: string;
  record: ModerationRecord;
};

export type DeactivateModerationRecordInput = {
  deactivatedBy: string;
  reason: string;
  recordId: string;
  reportId: string;
};

const dataDirectory = path.join(process.cwd(), ".data");
const moderationRecordsFile = path.join(dataDirectory, "moderation-records.json");
const moderationRecordsTable = "connectcircle_moderation_records";
const tursoModerationRecordsDocumentKey = "moderation-records";

let hasEnsuredTursoModerationSchema = false;
let hasBackfilledTursoModerationRecords = false;

function normalizeUsernameKey(username: string) {
  return username.trim().toLowerCase();
}

function cleanText(value: string, limit: number) {
  return value.trim().replace(/\s+/g, " ").slice(0, limit);
}

function isModerationRecord(value: unknown): value is ModerationRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Partial<ModerationRecord>;

  return (
    typeof record.id === "string" &&
    isModerationActionType(record.type) &&
    typeof record.createdBy === "string" &&
    typeof record.createdAt === "string" &&
    typeof record.reason === "string" &&
    typeof record.active === "boolean" &&
    (typeof record.reportId === "undefined" ||
      typeof record.reportId === "string") &&
    (typeof record.targetUsername === "undefined" ||
      typeof record.targetUsername === "string") &&
    (typeof record.targetUserId === "undefined" ||
      typeof record.targetUserId === "string") &&
    (typeof record.targetIp === "undefined" ||
      typeof record.targetIp === "string") &&
    (typeof record.note === "undefined" || typeof record.note === "string") &&
    (typeof record.deactivatedAt === "undefined" ||
      typeof record.deactivatedAt === "string") &&
    (typeof record.deactivatedBy === "undefined" ||
      typeof record.deactivatedBy === "string") &&
    (typeof record.deactivationReason === "undefined" ||
      typeof record.deactivationReason === "string") &&
    (typeof record.expiresAt === "undefined" ||
      typeof record.expiresAt === "string")
  );
}

function validateModerationRecords(value: unknown) {
  return Array.isArray(value) ? value.filter(isModerationRecord) : [];
}

function rowToModerationRecord(row: TursoRow) {
  const parsed = compressedTursoBlobToJson<unknown>(row.data_blob);

  return isModerationRecord(parsed) ? parsed : null;
}

async function ensureTursoModerationSchema() {
  if (hasEnsuredTursoModerationSchema) {
    return;
  }

  await getTursoClient().executeMultiple(`
    CREATE TABLE IF NOT EXISTS ${moderationRecordsTable} (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      active INTEGER NOT NULL,
      report_id TEXT,
      target_username TEXT,
      target_username_key TEXT,
      target_user_id TEXT,
      target_ip TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT,
      data_blob BLOB NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS connectcircle_moderation_records_user_idx
      ON ${moderationRecordsTable} (
        active,
        target_username_key,
        type,
        expires_at
      );

    CREATE INDEX IF NOT EXISTS connectcircle_moderation_records_ip_idx
      ON ${moderationRecordsTable} (active, target_ip, type, expires_at);

    CREATE INDEX IF NOT EXISTS connectcircle_moderation_records_report_idx
      ON ${moderationRecordsTable} (report_id, created_at);

    CREATE INDEX IF NOT EXISTS connectcircle_moderation_records_created_idx
      ON ${moderationRecordsTable} (created_at);
  `);

  hasEnsuredTursoModerationSchema = true;
}

async function countTursoModerationRecords() {
  await ensureTursoModerationSchema();

  const result = await getTursoClient().execute(
    `SELECT COUNT(*) AS count FROM ${moderationRecordsTable}`,
  );
  const row = result.rows[0];

  return row ? tursoRowNumber(row, "count") : 0;
}

async function upsertTursoModerationRecord(record: ModerationRecord) {
  await ensureTursoModerationSchema();

  await getTursoClient().execute({
    sql: `
      INSERT INTO ${moderationRecordsTable} (
        id,
        type,
        active,
        report_id,
        target_username,
        target_username_key,
        target_user_id,
        target_ip,
        created_by,
        created_at,
        expires_at,
        data_blob,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        type = excluded.type,
        active = excluded.active,
        report_id = excluded.report_id,
        target_username = excluded.target_username,
        target_username_key = excluded.target_username_key,
        target_user_id = excluded.target_user_id,
        target_ip = excluded.target_ip,
        created_by = excluded.created_by,
        created_at = excluded.created_at,
        expires_at = excluded.expires_at,
        data_blob = excluded.data_blob,
        updated_at = excluded.updated_at
    `,
    args: [
      record.id,
      record.type,
      record.active ? 1 : 0,
      record.reportId ?? null,
      record.targetUsername ?? null,
      record.targetUsername
        ? normalizeUsernameKey(record.targetUsername)
        : null,
      record.targetUserId ?? null,
      record.targetIp ?? null,
      record.createdBy,
      record.createdAt,
      record.expiresAt ?? null,
      valueToCompressedTursoBlob(record),
      new Date().toISOString(),
    ],
  });
}

async function backfillTursoModerationRecordsFromLegacyDocument() {
  if (hasBackfilledTursoModerationRecords) {
    return;
  }

  if ((await countTursoModerationRecords()) > 0) {
    hasBackfilledTursoModerationRecords = true;
    return;
  }

  const legacyRecords = await readTursoJsonDocument<ModerationRecord[]>(
    tursoModerationRecordsDocumentKey,
    [],
    validateModerationRecords,
  );

  for (const record of legacyRecords) {
    await upsertTursoModerationRecord(record);
  }

  hasBackfilledTursoModerationRecords = true;
}

async function readTursoModerationRecords() {
  await ensureTursoModerationSchema();
  await backfillTursoModerationRecordsFromLegacyDocument();

  const result = await getTursoClient().execute({
    sql: `
      SELECT data_blob
      FROM ${moderationRecordsTable}
      ORDER BY created_at DESC
    `,
    args: [],
  });

  return result.rows
    .map(rowToModerationRecord)
    .filter((record): record is ModerationRecord => Boolean(record));
}

async function readTursoModerationRecordsByReportId(reportId: string) {
  await ensureTursoModerationSchema();
  await backfillTursoModerationRecordsFromLegacyDocument();

  const result = await getTursoClient().execute({
    sql: `
      SELECT data_blob
      FROM ${moderationRecordsTable}
      WHERE report_id = ?
      ORDER BY created_at DESC
    `,
    args: [reportId],
  });

  return result.rows
    .map(rowToModerationRecord)
    .filter((record): record is ModerationRecord => Boolean(record));
}

async function findTursoModerationRecordForReport(
  recordId: string,
  reportId: string,
) {
  await ensureTursoModerationSchema();
  await backfillTursoModerationRecordsFromLegacyDocument();

  const result = await getTursoClient().execute({
    sql: `
      SELECT data_blob
      FROM ${moderationRecordsTable}
      WHERE id = ? AND report_id = ?
      LIMIT 1
    `,
    args: [recordId, reportId],
  });
  const row = result.rows[0];

  return row ? rowToModerationRecord(row) : null;
}

async function readTursoActiveUserModerationRecords(username: string) {
  await ensureTursoModerationSchema();
  await backfillTursoModerationRecordsFromLegacyDocument();

  const result = await getTursoClient().execute({
    sql: `
      SELECT data_blob
      FROM ${moderationRecordsTable}
      WHERE active = 1
        AND target_username_key = ?
        AND type IN ('restrict_user', 'ban_user', 'delete_user')
        AND (expires_at IS NULL OR expires_at > ?)
      ORDER BY created_at DESC
    `,
    args: [normalizeUsernameKey(username), new Date().toISOString()],
  });

  return result.rows
    .map(rowToModerationRecord)
    .filter((record): record is ModerationRecord => Boolean(record));
}

async function findTursoActiveIpBanRecord(ip: string) {
  await ensureTursoModerationSchema();
  await backfillTursoModerationRecordsFromLegacyDocument();

  const result = await getTursoClient().execute({
    sql: `
      SELECT data_blob
      FROM ${moderationRecordsTable}
      WHERE active = 1
        AND target_ip = ?
        AND type = 'ban_ip'
        AND (expires_at IS NULL OR expires_at > ?)
      ORDER BY created_at DESC
      LIMIT 1
    `,
    args: [ip, new Date().toISOString()],
  });
  const row = result.rows[0];

  return row ? rowToModerationRecord(row) : null;
}

async function syncTursoModerationRecords(records: ModerationRecord[]) {
  await ensureTursoModerationSchema();
  await backfillTursoModerationRecordsFromLegacyDocument();

  const nextRecordIds = new Set(records.map((record) => record.id));
  const existingRows = await getTursoClient().execute({
    sql: `SELECT id FROM ${moderationRecordsTable}`,
    args: [],
  });

  for (const row of existingRows.rows) {
    const id = tursoRowString(row, "id");

    if (id && !nextRecordIds.has(id)) {
      await getTursoClient().execute({
        sql: `DELETE FROM ${moderationRecordsTable} WHERE id = ?`,
        args: [id],
      });
    }
  }

  for (const record of records) {
    await upsertTursoModerationRecord(record);
  }
}

async function readJsonModerationRecords() {
  try {
    const file = await fs.readFile(moderationRecordsFile, "utf8");
    const parsed: unknown = JSON.parse(file);

    return validateModerationRecords(parsed);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function writeJsonModerationRecords(records: ModerationRecord[]) {
  await fs.mkdir(dataDirectory, { recursive: true });

  const temporaryFile = `${moderationRecordsFile}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(records, null, 2), "utf8");
  await fs.rename(temporaryFile, moderationRecordsFile);
}

async function readModerationRecords() {
  if (shouldUseTurso()) {
    return readTursoModerationRecords();
  }

  return readJsonModerationRecords();
}

async function writeModerationRecords(records: ModerationRecord[]) {
  if (shouldUseTurso()) {
    await syncTursoModerationRecords(records);
    return;
  }

  await writeJsonModerationRecords(records);
}

function isCurrentlyActive(record: ModerationRecord) {
  if (!record.active) {
    return false;
  }

  if (!record.expiresAt) {
    return true;
  }

  return new Date(record.expiresAt).getTime() > Date.now();
}

function sortNewestFirst(records: ModerationRecord[]) {
  return [...records].sort(
    (first, second) =>
      new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
  );
}

function getUserBlockMessage(record: ModerationRecord) {
  if (record.type === "restrict_user") {
    return "This account is restricted from making changes right now.";
  }

  if (record.type === "delete_user") {
    return "This account has been removed by ConnectCircle moderation.";
  }

  return "This account has been banned by ConnectCircle moderation.";
}

export async function getModerationRecords() {
  return sortNewestFirst(await readModerationRecords());
}

export async function getModerationRecordsByReportId(reportId: string) {
  if (shouldUseTurso()) {
    return readTursoModerationRecordsByReportId(reportId);
  }

  const records = await readModerationRecords();

  return sortNewestFirst(records.filter((record) => record.reportId === reportId));
}

export async function createModerationRecord(
  input: CreateModerationRecordInput,
) {
  const reason = cleanText(input.reason, 500);

  if (!reason) {
    return {
      error: "Add a moderation reason.",
      record: null,
    };
  }

  const targetIp = input.targetIp ? normalizeClientIp(input.targetIp) : "";
  const targetUsername = input.targetUsername?.trim() ?? "";

  if (input.type === "ban_ip" && !targetIp) {
    return {
      error: "Enter an IP address to ban.",
      record: null,
    };
  }

  if (input.type !== "ban_ip" && !targetUsername) {
    return {
      error: "Choose a user for this moderation action.",
      record: null,
    };
  }

  const record: ModerationRecord = {
    active: true,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy.trim(),
    id: randomUUID(),
    reason,
    type: input.type,
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
    ...(input.note ? { note: cleanText(input.note, 1000) } : {}),
    ...(input.reportId ? { reportId: input.reportId } : {}),
    ...(targetIp ? { targetIp } : {}),
    ...(input.targetUserId ? { targetUserId: input.targetUserId } : {}),
    ...(targetUsername ? { targetUsername } : {}),
  };

  if (shouldUseTurso()) {
    await ensureTursoModerationSchema();
    await backfillTursoModerationRecordsFromLegacyDocument();
    await upsertTursoModerationRecord(record);

    return {
      error: "",
      record,
    };
  }

  const records = await readModerationRecords();

  await writeModerationRecords([record, ...records]);

  return {
    error: "",
    record,
  };
}

export async function deactivateModerationRecord({
  deactivatedBy,
  reason,
  recordId,
  reportId,
}: DeactivateModerationRecordInput) {
  const cleanReason = cleanText(reason, 500);

  if (!cleanReason) {
    return {
      error: "Add a reason for lifting this action.",
      record: null,
    };
  }

  const records = shouldUseTurso() ? [] : await readModerationRecords();
  const existingRecord = shouldUseTurso()
    ? await findTursoModerationRecordForReport(recordId, reportId)
    : records.find(
        (record) => record.id === recordId && record.reportId === reportId,
      );

  if (!existingRecord) {
    return {
      error: "Moderation action could not be found.",
      record: null,
    };
  }

  if (existingRecord.type === "delete_user") {
    return {
      error: "Deleted accounts cannot be restored from this control.",
      record: null,
    };
  }

  if (!existingRecord.active) {
    return {
      error: "This moderation action is already inactive.",
      record: null,
    };
  }

  const deactivatedRecord: ModerationRecord = {
    ...existingRecord,
    active: false,
    deactivatedAt: new Date().toISOString(),
    deactivatedBy: deactivatedBy.trim(),
    deactivationReason: cleanReason,
  };

  if (shouldUseTurso()) {
    await upsertTursoModerationRecord(deactivatedRecord);
  } else {
    await writeModerationRecords(
      records.map((record) =>
        record.id === recordId ? deactivatedRecord : record,
      ),
    );
  }

  return {
    error: "",
    record: deactivatedRecord,
  };
}

export async function getActiveUserModerationRecords(username: string) {
  if (shouldUseTurso()) {
    return readTursoActiveUserModerationRecords(username);
  }

  const usernameKey = normalizeUsernameKey(username);
  const records = await readModerationRecords();

  return sortNewestFirst(
    records.filter(
      (record) =>
        record.targetUsername &&
        normalizeUsernameKey(record.targetUsername) === usernameKey &&
        isCurrentlyActive(record) &&
        (record.type === "restrict_user" ||
          record.type === "ban_user" ||
          record.type === "delete_user"),
    ),
  );
}

export async function getUserSignInBlock(username: string) {
  const records = await getActiveUserModerationRecords(username);
  const record = records.find(
    (currentRecord) =>
      currentRecord.type === "ban_user" ||
      currentRecord.type === "delete_user",
  );

  return record ? { message: getUserBlockMessage(record), record } : null;
}

export async function getUserMutationBlock(username: string) {
  const records = await getActiveUserModerationRecords(username);
  const record =
    records.find(
      (currentRecord) =>
        currentRecord.type === "ban_user" ||
        currentRecord.type === "delete_user",
    ) ?? records.find((currentRecord) => currentRecord.type === "restrict_user");

  return record ? { message: getUserBlockMessage(record), record } : null;
}

export async function getIpBanBlock(ip: string) {
  const cleanIp = normalizeClientIp(ip);

  if (!cleanIp) {
    return null;
  }

  const record = shouldUseTurso()
    ? await findTursoActiveIpBanRecord(cleanIp)
    : sortNewestFirst(await readModerationRecords()).find(
        (currentRecord) =>
          currentRecord.type === "ban_ip" &&
          currentRecord.targetIp === cleanIp &&
          isCurrentlyActive(currentRecord),
      );

  return record
    ? {
        message: `This IP address has been blocked by ConnectCircle moderation.`,
        record,
      }
    : null;
}

export function describeModerationAction(record: ModerationRecord) {
  const target =
    record.type === "ban_ip"
      ? record.targetIp
      : record.targetUsername
        ? `@${record.targetUsername}`
        : "unknown target";

  return `${getModerationActionLabel(record.type)} for ${target}`;
}
