import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  getModerationActionLabel,
  isModerationActionType,
  type ModerationActionType,
  type ModerationRecord,
} from "@/lib/moderationTypes";
import { normalizeClientIp } from "@/lib/requestIdentity";
import {
  readTursoJsonDocument,
  shouldUseTurso,
  writeTursoJsonDocument,
} from "@/lib/tursoStore";

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

const dataDirectory = path.join(process.cwd(), ".data");
const moderationRecordsFile = path.join(dataDirectory, "moderation-records.json");
const tursoModerationRecordsDocumentKey = "moderation-records";

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
    (typeof record.expiresAt === "undefined" ||
      typeof record.expiresAt === "string")
  );
}

function validateModerationRecords(value: unknown) {
  return Array.isArray(value) ? value.filter(isModerationRecord) : [];
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
    return readTursoJsonDocument<ModerationRecord[]>(
      tursoModerationRecordsDocumentKey,
      [],
      validateModerationRecords,
    );
  }

  return readJsonModerationRecords();
}

async function writeModerationRecords(records: ModerationRecord[]) {
  if (shouldUseTurso()) {
    await writeTursoJsonDocument(tursoModerationRecordsDocumentKey, records);
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
  const records = await readModerationRecords();

  await writeModerationRecords([record, ...records]);

  return {
    error: "",
    record,
  };
}

export async function deactivateModerationRecord(recordId: string) {
  const records = await readModerationRecords();
  let didDeactivate = false;

  await writeModerationRecords(
    records.map((record) => {
      if (record.id !== recordId || !record.active) {
        return record;
      }

      didDeactivate = true;
      return { ...record, active: false };
    }),
  );

  return didDeactivate;
}

export async function getActiveUserModerationRecords(username: string) {
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

  const records = await readModerationRecords();
  const record = sortNewestFirst(records).find(
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
