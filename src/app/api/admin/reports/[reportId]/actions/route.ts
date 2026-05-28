import { NextResponse } from "next/server";
import { deleteUserByUsername, getUserByUsername } from "@/lib/authStore";
import { getCurrentAdmin } from "@/lib/adminSession";
import {
  createModerationRecord,
  deactivateModerationRecord,
  describeModerationAction,
} from "@/lib/moderationStore";
import {
  getSafetyReportById,
  updateSafetyReportStatus,
} from "@/lib/reportStore";
import { isModerationActionType } from "@/lib/moderationTypes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AdminReportActionRouteContext = {
  params: Promise<{
    reportId: string;
  }>;
};

function cleanText(value: unknown, limit: number) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, limit)
    : "";
}

function getExpirationDate(value: unknown) {
  if (value !== "24h" && value !== "7d" && value !== "30d") {
    return "";
  }

  const hours = value === "24h" ? 24 : value === "7d" ? 24 * 7 : 24 * 30;

  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

export async function POST(
  request: Request,
  context: AdminReportActionRouteContext,
) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json(
      { error: "Admin authentication required." },
      { status: 401 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const actionType = input.type;

  if (!isModerationActionType(actionType)) {
    return NextResponse.json(
      { error: "Choose a valid moderation action." },
      { status: 400 },
    );
  }

  if (input.confirmed !== true) {
    return NextResponse.json(
      { error: "Confirm the moderation action before applying it." },
      { status: 400 },
    );
  }

  const reason = cleanText(input.reason, 500);

  if (reason.length < 3) {
    return NextResponse.json(
      { error: "Add a short reason for this moderation action." },
      { status: 400 },
    );
  }

  const { reportId } = await context.params;
  const report = await getSafetyReportById(reportId);

  if (!report) {
    return NextResponse.json(
      { error: "Report could not be found." },
      { status: 404 },
    );
  }

  const targetUser = await getUserByUsername(report.reportedUsername);
  const targetIp =
    actionType === "ban_ip"
      ? cleanText(input.targetIp || report.reporterIp, 120)
      : "";
  const moderationResult = await createModerationRecord({
    createdBy: admin.username,
    expiresAt:
      actionType === "delete_user" ? undefined : getExpirationDate(input.expiresIn),
    note: cleanText(input.note, 1000),
    reason,
    reportId: report.id,
    targetIp,
    targetUserId: targetUser?.id,
    targetUsername: actionType === "ban_ip" ? undefined : report.reportedUsername,
    type: actionType,
  });

  if (moderationResult.error || !moderationResult.record) {
    return NextResponse.json(
      { error: moderationResult.error || "Moderation action could not be saved." },
      { status: 400 },
    );
  }

  if (actionType === "delete_user") {
    await deleteUserByUsername(report.reportedUsername);
  }

  const existingNote = report.resolutionNote?.trim();
  const actionNote = `${describeModerationAction(
    moderationResult.record,
  )}. Reason: ${reason}`;

  await updateSafetyReportStatus(
    report.id,
    "resolved",
    admin.username,
    existingNote ? `${existingNote} ${actionNote}` : actionNote,
  );

  return NextResponse.json({
    action: moderationResult.record,
  });
}

export async function PATCH(
  request: Request,
  context: AdminReportActionRouteContext,
) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json(
      { error: "Admin authentication required." },
      { status: 401 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const recordId = cleanText(input.recordId, 120);
  const reason = cleanText(input.reason, 500);

  if (!recordId) {
    return NextResponse.json(
      { error: "Choose a moderation action to lift." },
      { status: 400 },
    );
  }

  const { reportId } = await context.params;
  const report = await getSafetyReportById(reportId);

  if (!report) {
    return NextResponse.json(
      { error: "Report could not be found." },
      { status: 404 },
    );
  }

  const result = await deactivateModerationRecord({
    deactivatedBy: admin.username,
    reason,
    recordId,
    reportId: report.id,
  });

  if (result.error || !result.record) {
    return NextResponse.json(
      { error: result.error || "Moderation action could not be lifted." },
      { status: 400 },
    );
  }

  const existingNote = report.resolutionNote?.trim();
  const actionNote = `Lifted ${describeModerationAction(
    result.record,
  )}. Reason: ${reason}`;

  await updateSafetyReportStatus(
    report.id,
    report.status,
    admin.username,
    existingNote ? `${existingNote} ${actionNote}` : actionNote,
  );

  return NextResponse.json({
    action: result.record,
  });
}
