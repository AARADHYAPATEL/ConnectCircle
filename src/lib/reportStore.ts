import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  getChatMediaAttachmentKind,
  type ChatMediaAttachment,
} from "@/lib/chatImageAttachments";
import { getUserByUsername } from "@/lib/authStore";
import { getChatMessageForReport } from "@/lib/chatStore";
import { getCircleMessageForReport } from "@/lib/circleStore";
import {
  readTursoJsonDocument,
  shouldUseTurso,
  writeTursoJsonDocument,
} from "@/lib/tursoStore";
import {
  isReportContextType,
  isReportReason,
  isReportStatus,
  reportDetailsLimit,
  reportReasonOptions,
  type ReportContextType,
  type ReportMessageSnapshot,
  type ReportReason,
  type ReportStatus,
  type SafetyReport,
} from "@/lib/reportTypes";

const dataDirectory = path.join(process.cwd(), ".data");
const reportsFile = path.join(dataDirectory, "reports.json");
const tursoReportsDocumentKey = "reports";

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
      typeof report.reporterUserAgent === "string")
  );
}

export async function readSafetyReports() {
  if (shouldUseTurso()) {
    return readTursoJsonDocument<SafetyReport[]>(
      tursoReportsDocumentKey,
      [],
      (value) => (Array.isArray(value) ? value.filter(isSafetyReport) : []),
    );
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
    await writeTursoJsonDocument(tursoReportsDocumentKey, reports);
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

  const reports = await readSafetyReports();
  const duplicateReport = reports.find(
    (report) =>
      areSameUser(report.reporterUsername, reporterUsername) &&
      report.contextType === input.contextType &&
      report.contextId === resolvedContext.contextId &&
      (report.status === "open" || report.status === "reviewing"),
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

  await writeReports([report, ...reports]);

  return {
    error: "",
    report,
  };
}

export async function getSafetyReports() {
  return sortReportsByCreatedAt(await readSafetyReports());
}

export async function getSafetyReportById(reportId: string) {
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

  const reports = await readSafetyReports();
  const existingReport = reports.find((report) => report.id === reportId);

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

  await writeReports(
    reports.map((report) =>
      report.id === updatedReport.id ? updatedReport : report,
    ),
  );

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
