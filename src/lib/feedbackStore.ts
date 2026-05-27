import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { sendFeedbackEmail } from "@/lib/feedbackEmail";
import {
  readTursoJsonDocument,
  shouldUseTurso,
  writeTursoJsonDocument,
} from "@/lib/tursoStore";
import {
  feedbackAffectedPageLimit,
  validateFeedbackImageAttachments,
  feedbackMessageLimit,
  isFeedbackCategory,
  isFeedbackFeature,
  isFeedbackPage,
  isFeedbackSeverity,
  isSavedFeedback,
  type SavedFeedback,
} from "@/lib/feedbackTypes";
import type { PublicUser } from "@/lib/authStore";

const dataDirectory = path.join(process.cwd(), ".data");
const feedbackFile = path.join(dataDirectory, "feedback.json");
const tursoFeedbackDocumentKey = "feedback";
let feedbackMutation = Promise.resolve();

type CreateFeedbackInput = {
  affectedPage: string;
  allowContact: boolean;
  category: unknown;
  feature: unknown;
  imageAttachments: unknown;
  message: string;
  page: unknown;
  severity: unknown;
};

type CreateFeedbackResult =
  | {
      error: string;
      feedback: null;
    }
  | {
      error: "";
      feedback: SavedFeedback;
    };

async function readFeedback() {
  if (shouldUseTurso()) {
    return readTursoJsonDocument<SavedFeedback[]>(
      tursoFeedbackDocumentKey,
      [],
      (value) => (Array.isArray(value) ? value.filter(isSavedFeedback) : []),
    );
  }

  try {
    const file = await fs.readFile(feedbackFile, "utf8");
    const parsed: unknown = JSON.parse(file);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isSavedFeedback);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function writeFeedback(feedback: SavedFeedback[]) {
  if (shouldUseTurso()) {
    await writeTursoJsonDocument(tursoFeedbackDocumentKey, feedback);
    return;
  }

  await fs.mkdir(dataDirectory, { recursive: true });
  await fs.writeFile(feedbackFile, JSON.stringify(feedback, null, 2), "utf8");
}

export async function createFeedback(
  user: PublicUser,
  input: CreateFeedbackInput,
): Promise<CreateFeedbackResult> {
  const nextFeedback = feedbackMutation.then(
    () => createFeedbackNow(user, input),
    () => createFeedbackNow(user, input),
  );

  feedbackMutation = nextFeedback.then(
    () => undefined,
    () => undefined,
  );

  return nextFeedback;
}

async function createFeedbackNow(
  user: PublicUser,
  input: CreateFeedbackInput,
): Promise<CreateFeedbackResult> {
  const message = input.message.trim();
  const affectedPage = input.affectedPage.trim();
  const imageAttachments = validateFeedbackImageAttachments(
    input.imageAttachments,
  );

  if (!isFeedbackCategory(input.category)) {
    return { error: "Choose a feedback type.", feedback: null };
  }

  if (!isFeedbackSeverity(input.severity)) {
    return { error: "Choose how serious this feels.", feedback: null };
  }

  if (!isFeedbackPage(input.page)) {
    return { error: "Choose a page.", feedback: null };
  }

  if (!isFeedbackFeature(input.feature)) {
    return { error: "Choose a feature.", feedback: null };
  }

  if (!message) {
    return { error: "Tell us what happened.", feedback: null };
  }

  if (message.length > feedbackMessageLimit) {
    return { error: "Feedback is too long.", feedback: null };
  }

  if (affectedPage.length > feedbackAffectedPageLimit) {
    return { error: "Page or feature is too long.", feedback: null };
  }

  if (imageAttachments.error) {
    return { error: imageAttachments.error, feedback: null };
  }

  const draftFeedback: SavedFeedback = {
    affectedPage: affectedPage || `${input.page} - ${input.feature}`,
    allowContact: input.allowContact,
    category: input.category,
    createdAt: new Date().toISOString(),
    email: input.allowContact ? user.email : undefined,
    emailStatus: "skipped",
    feature: input.feature,
    id: randomUUID(),
    ...(imageAttachments.attachments.length > 0
      ? { imageAttachments: imageAttachments.attachments }
      : {}),
    message,
    page: input.page,
    severity: input.severity,
    username: user.username,
  };

  let feedback = draftFeedback;

  try {
    const emailStatus = await sendFeedbackEmail(draftFeedback);
    feedback = { ...draftFeedback, emailStatus };
  } catch {
    feedback = { ...draftFeedback, emailStatus: "failed" };
  }

  const allFeedback = await readFeedback();
  await writeFeedback([feedback, ...allFeedback]);

  return { error: "", feedback };
}
