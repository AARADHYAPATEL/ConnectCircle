import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Row as TursoRow } from "@libsql/client";
import {
  getChatMediaAttachmentKind,
  type ChatMediaAttachment,
} from "@/lib/chatImageAttachments";
import { getUserByUsername, type PublicUser } from "@/lib/authStore";
import { getChatMessageForReport } from "@/lib/chatStore";
import { getCircleMessageForReport } from "@/lib/circleStore";
import { getUserNetworkRecordByUsername } from "@/lib/userNetworkStore";
import {
  compressedTursoBlobToJson,
  getTursoClient,
  readTursoJsonDocument,
  shouldUseTurso,
  valueToCompressedTursoBlob,
} from "@/lib/tursoStore";
import { tursoRowNumber, tursoRowString } from "@/lib/tursoRow";
import {
  isReportContextType,
  isReportReason,
  isReportStatus,
  isReportedUserSnapshot,
  reportDetailsLimit,
  reportReasonOptions,
  type ReportContextType,
  type ReportMessageSnapshot,
  type ReportedUserSnapshot,
  type ReportReason,
  type ReportStatus,
  type SafetyReport,
} from "@/lib/reportTypes";

const dataDirectory = path.join(process.cwd(), ".data");
const reportsFile = path.join(dataDirectory, "reports.json");
const reportsTable = "connectcircle_safety_reports";
const tursoReportsDocumentKey = "reports";

let hasEnsuredTursoReportsSchema = false;
let hasBackfilledTursoReports = false;

type CreateSafetyReportInput = {
  contextId: unknown;
  contextType: unknown;
  details: unknown;
  reason: unknown;
  reporterIp?: unknown;
  reporterUserAgent?: unknown;
  reportedUsername: unknown;
};

type CreateSafetyReportResult = {
  duplicate?: boolean;
  error: string;
  report: SafetyReport | null;
};

function normalizeUsername(username: string) {
  return username.trim();
}

function normalizeUsernameKey(username: string) {
  return normalizeUsername(username).toLowerCase();
}

function areSameUser(firstUsername: string, secondUsername: string) {
  return normalizeUsernameKey(firstUsername) === normalizeUsernameKey(secondUsername);
}

function cleanDetails(value: unknown) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, reportDetailsLimit)
    : "";
}

function cleanMetadataText(value: unknown, limit: number) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, limit)
    : "";
}

async function createReportedUserSnapshot(
  reportedUser: PublicUser,
): Promise<ReportedUserSnapshot> {
  const networkRecord = await getUserNetworkRecordByUsername(reportedUser.username);

  return {
    accountCreatedAt: reportedUser.createdAt,
    availabilityStatus: reportedUser.availabilityStatus,
    avatarImagePresent: Boolean(reportedUser.avatarImage),
    bio: reportedUser.bio,
    displayName: reportedUser.displayName,
    email: reportedUser.email,
    profileVisibility: reportedUser.profileVisibility,
    themePreference: reportedUser.themePreference,
    userId: reportedUser.id,
    username: reportedUser.username,
    ...(networkRecord?.lastIp ? { lastIp: networkRecord.lastIp } : {}),
    ...(networkRecord?.lastSeenAt ? { lastSeenAt: networkRecord.lastSeenAt } : {}),
    ...(networkRecord?.lastUserAgent
      ? { lastUserAgent: networkRecord.lastUserAgent }
      : {}),
  };
}

function isSafetyReport(value: unknown): value is SafetyReport {
  if (!value || typeof value !== "object") {
    return false;
  }

  const report = value as Partial<SafetyReport>;

  return (
    typeof report.id === "string" &&
    typeof report.reporterUsername === "string" &&
    typeof report.reportedUsername === "string" &&
    isReportReason(report.reason) &&
    typeof report.details === "string" &&
    isReportContextType(report.contextType) &&
    typeof report.contextId === "string" &&
    isReportStatus(report.status) &&
    typeof report.createdAt === "string" &&
    (typeof report.reporterIp === "undefined" ||
      typeof report.reporterIp === "string") &&
    (typeof report.reporterUserAgent === "undefined" ||
      typeof report.reporterUserAgent === "string") &&
    (typeof report.reportedUserSnapshot === "undefined" ||
      isReportedUserSnapshot(report.reportedUserSnapshot))
  );
}

function validateSafetyReportsDocument(value: unknown) {
  return Array.isArray(value) ? value.filter(isSafetyReport) : [];
}

function rowToSafetyReport(row: TursoRow) {
  const parsed = compressedTursoBlobToJson<unknown>(row.data_blob);

  return isSafetyReport(parsed) ? parsed : null;
}

async function ensureTursoReportsSchema() {
  if (hasEnsuredTursoReportsSchema) {
    return;
  }

  await getTursoClient().executeMultiple(`
    CREATE TABLE IF NOT EXISTS ${reportsTable} (
      id TEXT PRIMARY KEY,
      reporter_username TEXT NOT NULL,
      reporter_username_key TEXT NOT NULL,
      reported_username TEXT NOT NULL,
      reported_username_key TEXT NOT NULL,
      reason TEXT NOT NULL,
      context_type TEXT NOT NULL,
      context_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      reviewed_at TEXT,
      reviewed_by TEXT,
      data_blob BLOB NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS connectcircle_safety_reports_status_created_idx
      ON ${reportsTable} (status, created_at);

    CREATE INDEX IF NOT EXISTS connectcircle_safety_reports_reported_user_idx
      ON ${reportsTable} (reported_username_key, created_at);

    CREATE INDEX IF NOT EXISTS connectcircle_safety_reports_reporter_context_idx
      ON ${reportsTable} (
        reporter_username_key,
        context_type,
        context_id,
        status
      );
  `);

  hasEnsuredTursoReportsSchema = true;
}

async function countTursoSafetyReports() {
  await ensureTursoReportsSchema();

  const result = await getTursoClient().execute(
    `SELECT COUNT(*) AS count FROM ${reportsTable}`,
  );
  const row = result.rows[0];

  return row ? tursoRowNumber(row, "count") : 0;
}

async function upsertTursoSafetyReport(report: SafetyReport) {
  await ensureTursoReportsSchema();

  await getTursoClient().execute({
    sql: `
      INSERT INTO ${reportsTable} (
        id,
        reporter_username,
        reporter_username_key,
        reported_username,
        reported_username_key,
        reason,
        context_type,
        context_id,
        status,
        created_at,
        reviewed_at,
        reviewed_by,
        data_blob,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        reporter_username = excluded.reporter_username,
        reporter_username_key = excluded.reporter_username_key,
        reported_username = excluded.reported_username,
        reported_username_key = excluded.reported_username_key,
        reason = excluded.reason,
        context_type = excluded.context_type,
        context_id = excluded.context_id,
        status = excluded.status,
        created_at = excluded.created_at,
        reviewed_at = excluded.reviewed_at,
        reviewed_by = excluded.reviewed_by,
        data_blob = excluded.data_blob,
        updated_at = excluded.updated_at
    `,
    args: [
      report.id,
      report.reporterUsername,
      normalizeUsernameKey(report.reporterUsername),
      report.reportedUsername,
      normalizeUsernameKey(report.reportedUsername),
      report.reason,
      report.contextType,
      report.contextId,
      report.status,
      report.createdAt,
      report.reviewedAt ?? null,
      report.reviewedBy ?? null,
      valueToCompressedTursoBlob(report),
      new Date().toISOString(),
    ],
  });
}

async function upsertTursoSafetyReports(reports: SafetyReport[]) {
  for (const report of reports) {
    await upsertTursoSafetyReport(report);
  }
}

async function backfillTursoReportsFromLegacyDocument() {
  if (hasBackfilledTursoReports) {
    return;
  }

  if ((await countTursoSafetyReports()) > 0) {
    hasBackfilledTursoReports = true;
    return;
  }

  const legacyReports = await readTursoJsonDocument<SafetyReport[]>(
    tursoReportsDocumentKey,
    [],
    validateSafetyReportsDocument,
  );

  if (legacyReports.length > 0) {
    await upsertTursoSafetyReports(legacyReports);
  }

  hasBackfilledTursoReports = true;
}

async function readTursoSafetyReports() {
  await ensureTursoReportsSchema();
  await backfillTursoReportsFromLegacyDocument();

  const result = await getTursoClient().execute({
    sql: `
      SELECT data_blob
      FROM ${reportsTable}
      ORDER BY created_at DESC
    `,
    args: [],
  });

  return result.rows
    .map(rowToSafetyReport)
    .filter((report): report is SafetyReport => Boolean(report));
}

async function findTursoSafetyReportById(reportId: string) {
  await ensureTursoReportsSchema();
  await backfillTursoReportsFromLegacyDocument();

  const result = await getTursoClient().execute({
    sql: `
      SELECT data_blob
      FROM ${reportsTable}
      WHERE id = ?
      LIMIT 1
    `,
    args: [reportId],
  });
  const row = result.rows[0];

  return row ? rowToSafetyReport(row) : null;
}

async function findOpenTursoSafetyReportForContext(
  reporterUsername: string,
  contextType: ReportContextType,
  contextId: string,
) {
  await ensureTursoReportsSchema();
  await backfillTursoReportsFromLegacyDocument();

  const result = await getTursoClient().execute({
    sql: `
      SELECT data_blob
      FROM ${reportsTable}
      WHERE reporter_username_key = ?
        AND context_type = ?
        AND context_id = ?
        AND status IN ('open', 'reviewing')
      ORDER BY created_at DESC
      LIMIT 1
    `,
    args: [
      normalizeUsernameKey(reporterUsername),
      contextType,
      contextId,
    ],
  });
  const row = result.rows[0];

  return row ? rowToSafetyReport(row) : null;
}

async function insertSafetyReportRecord(report: SafetyReport) {
  if (shouldUseTurso()) {
    await ensureTursoReportsSchema();
    await backfillTursoReportsFromLegacyDocument();
    await upsertTursoSafetyReport(report);
    return;
  }

  await writeReports([report, ...(await readSafetyReports())]);
}

async function updateSafetyReportRecord(report: SafetyReport) {
  if (shouldUseTurso()) {
    await ensureTursoReportsSchema();
    await backfillTursoReportsFromLegacyDocument();
    await upsertTursoSafetyReport(report);
    return;
  }

  const reports = await readSafetyReports();

  await writeReports(
    reports.map((currentReport) =>
      currentReport.id === report.id ? report : currentReport,
    ),
  );
}

async function findOpenSafetyReportForContext(
  reporterUsername: string,
  contextType: ReportContextType,
  contextId: string,
) {
  if (shouldUseTurso()) {
    return findOpenTursoSafetyReportForContext(
      reporterUsername,
      contextType,
      contextId,
    );
  }

  const reports = await readSafetyReports();

  return (
    reports.find(
      (report) =>
        areSameUser(report.reporterUsername, reporterUsername) &&
        report.contextType === contextType &&
        report.contextId === contextId &&
        (report.status === "open" || report.status === "reviewing"),
    ) ?? null
  );
}

async function syncTursoSafetyReports(reports: SafetyReport[]) {
  await ensureTursoReportsSchema();
  await backfillTursoReportsFromLegacyDocument();

  const nextReportIds = new Set(reports.map((report) => report.id));
  const existingRows = await getTursoClient().execute({
    sql: `SELECT id FROM ${reportsTable}`,
    args: [],
  });

  for (const row of existingRows.rows) {
    const id = tursoRowString(row, "id");

    if (id && !nextReportIds.has(id)) {
      await getTursoClient().execute({
        sql: `DELETE FROM ${reportsTable} WHERE id = ?`,
        args: [id],
      });
    }
  }

  await upsertTursoSafetyReports(reports);
}

export async function readSafetyReports() {
  if (shouldUseTurso()) {
    return readTursoSafetyReports();
  }

  try {
    const file = await fs.readFile(reportsFile, "utf8");
    const parsed: unknown = JSON.parse(file);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isSafetyReport);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function writeReports(reports: SafetyReport[]) {
  if (shouldUseTurso()) {
    await syncTursoSafetyReports(reports);
    return;
  }

  await fs.mkdir(dataDirectory, { recursive: true });

  const temporaryFile = `${reportsFile}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(reports, null, 2), "utf8");
  await fs.rename(temporaryFile, reportsFile);
}

function sortReportsByCreatedAt(reports: SafetyReport[]) {
  return [...reports].sort(
    (first, second) =>
      new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
  );
}

function getReportReasonLabel(reason: ReportReason) {
  return (
    reportReasonOptions.find((option) => option.value === reason)?.label ??
    reason
  );
}

function getReportContextLabel(contextType: ReportContextType) {
  switch (contextType) {
    case "profile":
      return "Profile";
    case "dm_message":
      return "Direct message";
    case "circle_message":
      return "CircleChat message";
  }
}

function createMessageSnapshot(
  message: {
    createdAt: string;
    editedAt?: string;
    fromUsername: string;
    id: string;
    imageAttachment?: ChatMediaAttachment;
    message: string;
  },
  circle?: {
    id: string;
    name: string;
  },
): ReportMessageSnapshot {
  const mediaAttachment = message.imageAttachment
    ? {
        kind: getChatMediaAttachmentKind(message.imageAttachment),
        name: message.imageAttachment.name,
        size: message.imageAttachment.size,
        type: message.imageAttachment.type,
      }
    : undefined;

  return {
    authorUsername: message.fromUsername,
    ...(circle ? { circleId: circle.id, circleName: circle.name } : {}),
    createdAt: message.createdAt,
    ...(message.editedAt ? { editedAt: message.editedAt } : {}),
    ...(mediaAttachment ? { mediaAttachment } : {}),
    message: message.message,
    messageId: message.id,
  };
}

async function resolveReportContext(
  reporterUsername: string,
  contextType: ReportContextType,
  rawContextId: unknown,
  rawReportedUsername: unknown,
) {
  if (contextType === "profile") {
    const reportedUsername =
      typeof rawReportedUsername === "string"
        ? normalizeUsername(rawReportedUsername)
        : "";

    return {
      contextId: reportedUsername,
      messageSnapshot: undefined,
      reportedUsername,
      error: reportedUsername ? "" : "Choose a user to report.",
    };
  }

  const contextId =
    typeof rawContextId === "string" ? rawContextId.trim() : "";

  if (!contextId) {
    return {
      contextId,
      messageSnapshot: undefined,
      reportedUsername: "",
      error: "Choose a message to report.",
    };
  }

  if (contextType === "dm_message") {
    const result = await getChatMessageForReport(reporterUsername, contextId);

    return {
      contextId,
      messageSnapshot: result.message
        ? createMessageSnapshot(result.message)
        : undefined,
      reportedUsername: result.message?.fromUsername ?? "",
      error: result.error,
    };
  }

  const result = await getCircleMessageForReport(reporterUsername, contextId);

  return {
    contextId,
    messageSnapshot: result.message
      ? createMessageSnapshot(result.message, result.circle ?? undefined)
      : undefined,
    reportedUsername: result.message?.fromUsername ?? "",
    error: result.error,
  };
}

export async function createSafetyReport(
  reporterUsername: string,
  input: CreateSafetyReportInput,
): Promise<CreateSafetyReportResult> {
  if (!isReportContextType(input.contextType)) {
    return {
      error: "Choose what you are reporting.",
      report: null,
    };
  }

  if (!isReportReason(input.reason)) {
    return {
      error: "Choose a reason for the report.",
      report: null,
    };
  }

  const resolvedContext = await resolveReportContext(
    reporterUsername,
    input.contextType,
    input.contextId,
    input.reportedUsername,
  );

  if (resolvedContext.error) {
    return {
      error: resolvedContext.error,
      report: null,
    };
  }

  if (areSameUser(reporterUsername, resolvedContext.reportedUsername)) {
    return {
      error: "You cannot report your own account.",
      report: null,
    };
  }

  const reportedUser = await getUserByUsername(resolvedContext.reportedUsername);

  if (!reportedUser) {
    return {
      error: "The reported user could not be found.",
      report: null,
    };
  }

  const duplicateReport = await findOpenSafetyReportForContext(
    reporterUsername,
    input.contextType,
    resolvedContext.contextId,
  );

  if (duplicateReport) {
    return {
      duplicate: true,
      error: "You have already reported this.",
      report: duplicateReport,
    };
  }

  const report: SafetyReport = {
    id: randomUUID(),
    reporterUsername: normalizeUsername(reporterUsername),
    reportedUsername: reportedUser.username,
    reason: input.reason as ReportReason,
    details: cleanDetails(input.details),
    contextType: input.contextType,
    contextId: resolvedContext.contextId,
    reportedUserSnapshot: await createReportedUserSnapshot(reportedUser),
    ...(cleanMetadataText(input.reporterIp, 120)
      ? { reporterIp: cleanMetadataText(input.reporterIp, 120) }
      : {}),
    ...(cleanMetadataText(input.reporterUserAgent, 300)
      ? { reporterUserAgent: cleanMetadataText(input.reporterUserAgent, 300) }
      : {}),
    ...(resolvedContext.messageSnapshot
      ? { messageSnapshot: resolvedContext.messageSnapshot }
      : {}),
    status: "open",
    createdAt: new Date().toISOString(),
  };

  await insertSafetyReportRecord(report);

  return {
    error: "",
    report,
  };
}

export async function getSafetyReports() {
  return sortReportsByCreatedAt(await readSafetyReports());
}

export async function getSafetyReportById(reportId: string) {
  if (shouldUseTurso()) {
    return findTursoSafetyReportById(reportId);
  }

  const reports = await readSafetyReports();

  return reports.find((report) => report.id === reportId) ?? null;
}

export async function updateSafetyReportStatus(
  reportId: string,
  status: unknown,
  reviewedBy: string,
  resolutionNote: unknown,
) {
  if (!isReportStatus(status)) {
    return {
      error: "Choose a valid report status.",
      report: null,
    };
  }

  const existingReport = await getSafetyReportById(reportId);

  if (!existingReport) {
    return {
      error: "Report could not be found.",
      report: null,
    };
  }

  const cleanResolutionNote =
    typeof resolutionNote === "string"
      ? resolutionNote.trim().replace(/\s+/g, " ").slice(0, 1000)
      : "";
  const updatedReport: SafetyReport = {
    ...existingReport,
    status: status as ReportStatus,
    reviewedAt: new Date().toISOString(),
    reviewedBy,
    resolutionNote: cleanResolutionNote,
  };

  await updateSafetyReportRecord(updatedReport);

  return {
    error: "",
    report: updatedReport,
  };
}

export function formatSafetyReportText(report: SafetyReport) {
  const lines = [
    "ConnectCircle Safety Report",
    "",
    `Report ID: ${report.id}`,
    `Status: ${report.status}`,
    `Created: ${report.createdAt}`,
    `Reporter: @${report.reporterUsername}`,
    `Reported user: @${report.reportedUsername}`,
    `Reason: ${getReportReasonLabel(report.reason)}`,
    `Context: ${getReportContextLabel(report.contextType)}`,
    `Context ID: ${report.contextId}`,
    "",
    "Details:",
    report.details || "(none provided)",
    "",
  ];

  if (report.reporterIp || report.reporterUserAgent) {
    lines.push(
      "Request metadata:",
      `Reporter IP: ${report.reporterIp || "(not recorded)"}`,
      `Reporter user agent: ${report.reporterUserAgent || "(not recorded)"}`,
      "",
    );
  }

  if (report.reportedUserSnapshot) {
    lines.push(
      "Reported user snapshot:",
      `User ID: ${report.reportedUserSnapshot.userId}`,
      `Username: @${report.reportedUserSnapshot.username}`,
      `Email: ${report.reportedUserSnapshot.email}`,
      `Display name: ${report.reportedUserSnapshot.displayName}`,
      `Bio: ${report.reportedUserSnapshot.bio || "(empty)"}`,
      `Profile visibility: ${report.reportedUserSnapshot.profileVisibility}`,
      `Availability: ${report.reportedUserSnapshot.availabilityStatus}`,
      `Theme preference: ${report.reportedUserSnapshot.themePreference}`,
      `Account created: ${report.reportedUserSnapshot.accountCreatedAt}`,
      `Profile image: ${
        report.reportedUserSnapshot.avatarImagePresent ? "present" : "not set"
      }`,
      `Last known IP: ${report.reportedUserSnapshot.lastIp || "(not recorded)"}`,
      `Last seen: ${report.reportedUserSnapshot.lastSeenAt || "(not recorded)"}`,
      `Last user agent: ${
        report.reportedUserSnapshot.lastUserAgent || "(not recorded)"
      }`,
      "",
    );
  }

  if (report.messageSnapshot) {
    lines.push(
      "Message snapshot:",
      `Message ID: ${report.messageSnapshot.messageId}`,
      `Author: @${report.messageSnapshot.authorUsername}`,
      `Created: ${report.messageSnapshot.createdAt}`,
    );

    if (report.messageSnapshot.editedAt) {
      lines.push(`Edited: ${report.messageSnapshot.editedAt}`);
    }

    if (report.messageSnapshot.circleName) {
      lines.push(`Circle: ${report.messageSnapshot.circleName}`);
    }

    lines.push("", "Message text:", report.messageSnapshot.message || "(empty)");

    if (report.messageSnapshot.mediaAttachment) {
      lines.push(
        "",
        "Media attachment:",
        `Kind: ${report.messageSnapshot.mediaAttachment.kind}`,
        `Name: ${report.messageSnapshot.mediaAttachment.name}`,
        `Type: ${report.messageSnapshot.mediaAttachment.type}`,
        `Size: ${report.messageSnapshot.mediaAttachment.size} bytes`,
      );
    }

    lines.push("");
  }

  if (report.reviewedAt || report.reviewedBy || report.resolutionNote) {
    lines.push(
      "Review:",
      `Reviewed at: ${report.reviewedAt || "(not recorded)"}`,
      `Reviewed by: ${report.reviewedBy || "(not recorded)"}`,
      "",
      "Resolution note:",
      report.resolutionNote || "(none provided)",
      "",
    );
  }

  return `${lines.join("\n")}\n`;
}
