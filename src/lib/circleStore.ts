import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Row as TursoRow } from "@libsql/client";
import {
  isChatMediaAttachment,
  type ChatMediaAttachment,
} from "@/lib/chatImageAttachments";
import { getFriendUsernames } from "@/lib/connectionStore";
import {
  deleteMediaAttachment,
  uploadMediaAttachment,
} from "@/lib/mediaStorage";
import {
  getTursoClient,
  readTursoJsonDocument,
  shouldUseTurso,
  tursoBlobValueToBuffer,
  writeTursoJsonDocument,
} from "@/lib/tursoStore";
import {
  tursoRowOptionalNumber,
  tursoRowOptionalString,
  tursoRowString,
} from "@/lib/tursoRow";
import {
  circleDescriptionLimit,
  circleMessageLimit,
  circleNameLimit,
  isCircle,
  isCircleJoinRequest,
  isCircleMessage,
  type Circle,
  type CircleChatThread,
  type CircleJoinRequest,
  type CircleJoinRequestWithCircle,
  type CircleSummary,
  type CircleMessage,
} from "@/lib/circleTypes";

const dataDirectory = path.join(process.cwd(), ".data");
const circlesFile = path.join(dataDirectory, "circles.json");
const circleMessagesTable = "connectcircle_circle_messages";
const tursoCirclesDocumentKey = "circles";
const circleMessageNotificationLimit = 20;

let hasEnsuredTursoCircleMessagesSchema = false;
let hasBackfilledTursoCircleMessages = false;

type CircleData = {
  circles: Circle[];
  joinRequests: CircleJoinRequest[];
  messages: CircleMessage[];
};

type CircleMetaData = Omit<CircleData, "messages">;

type StoredCircleData = {
  circles: unknown[];
  joinRequests?: unknown[];
  messages?: unknown[];
};

type CreateCircleResult = {
  circle: Circle | null;
  error: string;
};

type CircleThreadResult = {
  error: string;
  thread: CircleChatThread | null;
};

type SendCircleMessageResult = {
  error: string;
  message: CircleMessage | null;
};

type CircleMessageMutationResult = {
  error: string;
  message: CircleMessage | null;
};

type DeleteCircleMessageResult = {
  error: string;
};

type CircleMutationResult = {
  circle: Circle | null;
  error: string;
};

type CircleJoinRequestResult = {
  circle: Circle | null;
  error: string;
  request: CircleJoinRequest | null;
};

type CircleRecipientsResult = {
  circleIds: string[];
  circles: Circle[];
  error: string;
  recipients: string[];
};

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function normalizeCircleName(name: string) {
  return name.trim().toLowerCase();
}

function areSameUser(firstUsername: string, secondUsername: string) {
  return normalizeUsername(firstUsername) === normalizeUsername(secondUsername);
}

function isCircleData(value: unknown): value is StoredCircleData {
  if (!value || typeof value !== "object") {
    return false;
  }

  const data = value as Partial<StoredCircleData>;

  return Array.isArray(data.circles);
}

function validateCircleDocument(value: unknown): CircleData {
  if (!isCircleData(value)) {
    return { circles: [], joinRequests: [], messages: [] };
  }

  return {
    circles: value.circles.filter(isCircle),
    joinRequests: Array.isArray(value.joinRequests)
      ? value.joinRequests.filter(isCircleJoinRequest)
      : [],
    messages: Array.isArray(value.messages)
      ? value.messages.filter(isCircleMessage)
      : [],
  };
}

function isMember(circle: Circle, username: string) {
  return circle.memberUsernames.some((memberUsername) =>
    areSameUser(memberUsername, username),
  );
}

function sortCircles(circles: Circle[]) {
  return [...circles].sort(
    (first, second) =>
      new Date(second.createdAt).getTime() -
      new Date(first.createdAt).getTime(),
  );
}

function sortMessagesAscending(messages: CircleMessage[]) {
  return [...messages].sort(
    (first, second) =>
      new Date(first.createdAt).getTime() -
      new Date(second.createdAt).getTime(),
  );
}

function sortJoinRequests(requests: CircleJoinRequest[]) {
  return [...requests].sort(
    (first, second) =>
      new Date(second.createdAt).getTime() -
      new Date(first.createdAt).getTime(),
  );
}

function joinRequestWithCircle(
  request: CircleJoinRequest,
  circle: Circle | undefined,
): CircleJoinRequestWithCircle | null {
  return circle
    ? {
        ...request,
        circle,
      }
    : null;
}

function circleMessageAttachmentToBytes(attachment: ChatMediaAttachment) {
  if (!attachment.dataUrl) {
    return null;
  }

  const prefix = `data:${attachment.type};base64,`;

  if (!attachment.dataUrl.startsWith(prefix)) {
    return null;
  }

  return new Uint8Array(Buffer.from(attachment.dataUrl.slice(prefix.length), "base64"));
}

function tursoRowToCircleAttachment(row: TursoRow) {
  const name = tursoRowOptionalString(row, "media_name");
  const type = tursoRowOptionalString(row, "media_type");
  const size = tursoRowOptionalNumber(row, "media_size");
  const url = tursoRowOptionalString(row, "media_url");
  const cloudinaryPublicId = tursoRowOptionalString(row, "media_public_id");
  const provider = tursoRowOptionalString(row, "media_provider");
  const data = tursoBlobValueToBuffer(row.media_data);

  if (!name || !type || size === null) {
    return null;
  }

  const candidateAttachment = url
    ? {
        cloudinaryPublicId: cloudinaryPublicId ?? undefined,
        kind: type.startsWith("video/") ? "video" : "image",
        name,
        provider: provider === "cloudinary" ? "cloudinary" : undefined,
        size,
        type,
        url,
      }
    : data
      ? {
          dataUrl: `data:${type};base64,${data.toString("base64")}`,
          kind: type.startsWith("video/") ? "video" : "image",
          name,
          size,
          type,
        }
      : null;

  return candidateAttachment && isChatMediaAttachment(candidateAttachment)
    ? candidateAttachment
    : null;
}

function rowToTursoCircleMessage(
  row: TursoRow,
  options: { includeMediaData: boolean },
): CircleMessage {
  const message: CircleMessage = {
    id: tursoRowString(row, "id"),
    circleId: tursoRowString(row, "circle_id"),
    fromUsername: tursoRowString(row, "from_username"),
    message: tursoRowString(row, "message"),
    createdAt: tursoRowString(row, "created_at"),
    ...(tursoRowOptionalString(row, "edited_at")
      ? { editedAt: tursoRowString(row, "edited_at") }
      : {}),
  };
  const imageAttachment = options.includeMediaData
    ? tursoRowToCircleAttachment(row)
    : null;
  const candidateMessage = {
    ...message,
    ...(imageAttachment ? { imageAttachment } : {}),
  };

  return isCircleMessage(candidateMessage) ? candidateMessage : message;
}

function circleMessageToTursoValues(message: CircleMessage) {
  const attachment = message.imageAttachment ?? null;
  const attachmentBytes = attachment
    ? circleMessageAttachmentToBytes(attachment)
    : null;

  return [
    message.id,
    message.circleId,
    message.fromUsername,
    message.message,
    attachment?.name ?? null,
    attachment?.type ?? null,
    attachment?.size ?? null,
    attachment?.url ?? null,
    attachment?.cloudinaryPublicId ?? null,
    attachment?.provider ?? null,
    attachmentBytes,
    message.createdAt,
    message.editedAt ?? null,
    new Date().toISOString(),
  ];
}

async function ensureTursoCircleMessageMediaColumns() {
  const result = await getTursoClient().execute(
    `PRAGMA table_info(${circleMessagesTable})`,
  );
  const existingColumns = new Set(
    result.rows
      .map((row) => tursoRowOptionalString(row, "name"))
      .filter((name): name is string => Boolean(name)),
  );

  for (const [name, definition] of [
    ["media_url", "TEXT"],
    ["media_public_id", "TEXT"],
    ["media_provider", "TEXT"],
  ] as const) {
    if (!existingColumns.has(name)) {
      await getTursoClient().execute(
        `ALTER TABLE ${circleMessagesTable} ADD COLUMN ${name} ${definition}`,
      );
    }
  }
}

async function prepareStoredCircleAttachment(
  attachment: ChatMediaAttachment | null,
  messageId: string,
) {
  return uploadMediaAttachment(attachment, {
    folder: "circle-chat",
    messageId,
  });
}

function didReplaceStoredAttachment(
  previousAttachment: ChatMediaAttachment | null | undefined,
  nextAttachment: ChatMediaAttachment | null | undefined,
) {
  return (
    previousAttachment?.cloudinaryPublicId &&
    previousAttachment.cloudinaryPublicId !== nextAttachment?.cloudinaryPublicId
  );
}

async function ensureTursoCircleMessagesSchema() {
  if (hasEnsuredTursoCircleMessagesSchema) {
    return;
  }

  await getTursoClient().executeMultiple(`
    CREATE TABLE IF NOT EXISTS ${circleMessagesTable} (
      id TEXT PRIMARY KEY,
      circle_id TEXT NOT NULL,
      from_username TEXT NOT NULL,
      message TEXT NOT NULL,
      media_name TEXT,
      media_type TEXT,
      media_size INTEGER,
      media_url TEXT,
      media_public_id TEXT,
      media_provider TEXT,
      media_data BLOB,
      created_at TEXT NOT NULL,
      edited_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS connectcircle_circle_messages_circle_idx
      ON ${circleMessagesTable} (circle_id, created_at);

    CREATE INDEX IF NOT EXISTS connectcircle_circle_messages_author_idx
      ON ${circleMessagesTable} (from_username, created_at);

    CREATE INDEX IF NOT EXISTS connectcircle_circle_messages_created_idx
      ON ${circleMessagesTable} (created_at);
  `);

  await ensureTursoCircleMessageMediaColumns();

  hasEnsuredTursoCircleMessagesSchema = true;
}

async function readTursoCircleDocument() {
  return readTursoJsonDocument<CircleData>(
    tursoCirclesDocumentKey,
    { circles: [], joinRequests: [], messages: [] },
    validateCircleDocument,
  );
}

async function compactTursoCircleDocument(data: CircleData | CircleMetaData) {
  await writeTursoJsonDocument(tursoCirclesDocumentKey, {
    circles: data.circles,
    joinRequests: data.joinRequests,
    messages: [],
  } satisfies CircleData);
}

async function insertTursoCircleMessage(message: CircleMessage) {
  await ensureTursoCircleMessagesSchema();

  await getTursoClient().execute({
    sql: `
      INSERT INTO ${circleMessagesTable} (
        id,
        circle_id,
        from_username,
        message,
        media_name,
        media_type,
        media_size,
        media_url,
        media_public_id,
        media_provider,
        media_data,
        created_at,
        edited_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        circle_id = excluded.circle_id,
        from_username = excluded.from_username,
        message = excluded.message,
        media_name = excluded.media_name,
        media_type = excluded.media_type,
        media_size = excluded.media_size,
        media_url = excluded.media_url,
        media_public_id = excluded.media_public_id,
        media_provider = excluded.media_provider,
        media_data = excluded.media_data,
        created_at = excluded.created_at,
        edited_at = excluded.edited_at,
        updated_at = excluded.updated_at
    `,
    args: circleMessageToTursoValues(message),
  });
}

async function backfillTursoCircleMessagesFromLegacyDocument() {
  if (hasBackfilledTursoCircleMessages) {
    return;
  }

  const legacyData = await readTursoCircleDocument();
  await ensureTursoCircleMessagesSchema();

  if (legacyData.messages.length > 0) {
    for (const message of legacyData.messages) {
      await insertTursoCircleMessage(message);
    }

    await compactTursoCircleDocument(legacyData);
  }

  hasBackfilledTursoCircleMessages = true;
}

async function readTursoCircleMessages() {
  await ensureTursoCircleMessagesSchema();
  await backfillTursoCircleMessagesFromLegacyDocument();

  const result = await getTursoClient().execute({
    sql: `
      SELECT
        id,
        circle_id,
        from_username,
        message,
        media_name,
        media_type,
        media_size,
        media_url,
        media_public_id,
        media_provider,
        media_data,
        created_at,
        edited_at
      FROM ${circleMessagesTable}
      ORDER BY created_at DESC
    `,
    args: [],
  });

  return result.rows.map((row) =>
    rowToTursoCircleMessage(row, { includeMediaData: true }),
  );
}

async function readTursoCircleMessagesForCircle(circleId: string) {
  await ensureTursoCircleMessagesSchema();
  await backfillTursoCircleMessagesFromLegacyDocument();

  const result = await getTursoClient().execute({
    sql: `
      SELECT
        id,
        circle_id,
        from_username,
        message,
        media_name,
        media_type,
        media_size,
        media_url,
        media_public_id,
        media_provider,
        media_data,
        created_at,
        edited_at
      FROM ${circleMessagesTable}
      WHERE circle_id = ?
      ORDER BY created_at ASC
    `,
    args: [circleId],
  });

  return result.rows.map((row) =>
    rowToTursoCircleMessage(row, { includeMediaData: true }),
  );
}

async function readTursoCircleMessagesForCircles(
  circleIds: string[],
  username: string,
  limit: number,
) {
  if (circleIds.length === 0) {
    return [];
  }

  await ensureTursoCircleMessagesSchema();
  await backfillTursoCircleMessagesFromLegacyDocument();

  const circlePlaceholders = circleIds.map(() => "?").join(", ");
  const result = await getTursoClient().execute({
    sql: `
      SELECT
        id,
        circle_id,
        from_username,
        message,
        media_name,
        media_type,
        media_size,
        media_url,
        media_public_id,
        media_provider,
        created_at,
        edited_at
      FROM ${circleMessagesTable}
      WHERE circle_id IN (${circlePlaceholders})
        AND lower(from_username) <> ?
      ORDER BY created_at DESC
      LIMIT ?
    `,
    args: [...circleIds, normalizeUsername(username), limit],
  });

  return result.rows.map((row) =>
    rowToTursoCircleMessage(row, { includeMediaData: false }),
  );
}

async function findTursoCircleMessageById(messageId: string) {
  await ensureTursoCircleMessagesSchema();
  await backfillTursoCircleMessagesFromLegacyDocument();

  const result = await getTursoClient().execute({
    sql: `
      SELECT
        id,
        circle_id,
        from_username,
        message,
        media_name,
        media_type,
        media_size,
        media_url,
        media_public_id,
        media_provider,
        media_data,
        created_at,
        edited_at
      FROM ${circleMessagesTable}
      WHERE id = ?
      LIMIT 1
    `,
    args: [messageId],
  });
  const row = result.rows[0];

  return row
    ? rowToTursoCircleMessage(row, { includeMediaData: true })
    : null;
}

async function deleteTursoCircleMessage(messageId: string) {
  await ensureTursoCircleMessagesSchema();

  await getTursoClient().execute({
    sql: `DELETE FROM ${circleMessagesTable} WHERE id = ?`,
    args: [messageId],
  });
}

async function syncTursoCircleMessages(messages: CircleMessage[]) {
  await ensureTursoCircleMessagesSchema();
  await backfillTursoCircleMessagesFromLegacyDocument();

  const nextMessageIds = new Set(messages.map((message) => message.id));
  const existingRows = await getTursoClient().execute({
    sql: `SELECT id FROM ${circleMessagesTable}`,
    args: [],
  });

  for (const row of existingRows.rows) {
    const id = tursoRowString(row, "id");

    if (id && !nextMessageIds.has(id)) {
      await deleteTursoCircleMessage(id);
    }
  }

  for (const message of messages) {
    await insertTursoCircleMessage(message);
  }
}

async function readTursoCircleData(): Promise<CircleData> {
  await ensureTursoCircleMessagesSchema();
  await backfillTursoCircleMessagesFromLegacyDocument();

  const data = await readTursoCircleDocument();

  return {
    circles: data.circles,
    joinRequests: data.joinRequests,
    messages: await readTursoCircleMessages(),
  };
}

async function readCircleMetaData(): Promise<CircleMetaData> {
  if (shouldUseTurso()) {
    await ensureTursoCircleMessagesSchema();
    await backfillTursoCircleMessagesFromLegacyDocument();

    const data = await readTursoCircleDocument();

    return {
      circles: data.circles,
      joinRequests: data.joinRequests,
    };
  }

  const data = await readCircleData();

  return {
    circles: data.circles,
    joinRequests: data.joinRequests,
  };
}

async function readCircleData(): Promise<CircleData> {
  if (shouldUseTurso()) {
    return readTursoCircleData();
  }

  try {
    const file = await fs.readFile(circlesFile, "utf8");
    const parsed: unknown = JSON.parse(file);

    return validateCircleDocument(parsed);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { circles: [], joinRequests: [], messages: [] };
    }

    throw error;
  }
}

async function writeCircleData(data: CircleData) {
  if (shouldUseTurso()) {
    await ensureTursoCircleMessagesSchema();
    await backfillTursoCircleMessagesFromLegacyDocument();
    await compactTursoCircleDocument(data);
    await syncTursoCircleMessages(data.messages);
    return;
  }

  await fs.mkdir(dataDirectory, { recursive: true });

  const temporaryFile = `${circlesFile}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(temporaryFile, circlesFile);
}

function getUniqueCleanValues(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => value.toLowerCase()),
    ),
  );
}

async function createCircleJoinRequest(
  data: CircleData,
  circle: Circle,
  fromUsername: string,
  options: { requireOwnerFriend: boolean },
): Promise<CircleJoinRequestResult> {
  if (isMember(circle, fromUsername)) {
    return {
      circle,
      error: "You already belong to this circle.",
      request: null,
    };
  }

  if (options.requireOwnerFriend) {
    const friendUsernames = await getFriendUsernames(fromUsername);
    const isOwnerFriend = friendUsernames.some((friendUsername) =>
      areSameUser(friendUsername, circle.ownerUsername),
    );

    if (!isOwnerFriend) {
      return {
        circle,
        error: "You can only request circles created by accepted friends.",
        request: null,
      };
    }
  }

  const pendingRequest = data.joinRequests.find(
    (request) =>
      request.status === "pending" &&
      request.circleId === circle.id &&
      areSameUser(request.fromUsername, fromUsername),
  );

  if (pendingRequest) {
    return {
      circle,
      error: "You already requested to join this circle.",
      request: pendingRequest,
    };
  }

  const request: CircleJoinRequest = {
    id: randomUUID(),
    circleId: circle.id,
    fromUsername,
    toUsername: circle.ownerUsername,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  await writeCircleData({
    ...data,
    joinRequests: [request, ...data.joinRequests],
  });

  return {
    circle,
    error: "",
    request,
  };
}

export async function getCirclesForUser(username: string) {
  const data = await readCircleMetaData();

  return sortCircles(
    data.circles.filter((circle) => isMember(circle, username)),
  );
}

export async function getCircleSummaryForUser(
  username: string,
): Promise<CircleSummary> {
  const [data, friendUsernames] = await Promise.all([
    readCircleMetaData(),
    getFriendUsernames(username),
  ]);
  const normalizedUsername = normalizeUsername(username);
  const friendUsernameKeys = new Set(
    friendUsernames.map((friendUsername) => normalizeUsername(friendUsername)),
  );
  const pendingJoinRequests = data.joinRequests.filter(
    (request) => request.status === "pending",
  );
  const pendingOutgoingCircleIds = new Set(
    pendingJoinRequests
      .filter((request) => areSameUser(request.fromUsername, username))
      .map((request) => request.circleId),
  );
  const circlesById = new Map(
    data.circles.map((circle) => [circle.id, circle]),
  );
  const attachCircle = (request: CircleJoinRequest) =>
    joinRequestWithCircle(request, circlesById.get(request.circleId));

  return {
    circles: sortCircles(
      data.circles.filter((circle) => isMember(circle, username)),
    ),
    discoverableCircles: sortCircles(
      data.circles.filter(
        (circle) =>
          !isMember(circle, username) &&
          friendUsernameKeys.has(normalizeUsername(circle.ownerUsername)) &&
          !pendingOutgoingCircleIds.has(circle.id),
      ),
    ),
    incomingJoinRequests: sortJoinRequests(
      pendingJoinRequests.filter((request) => {
        const circle = circlesById.get(request.circleId);

        return (
          areSameUser(request.toUsername, normalizedUsername) &&
          Boolean(circle) &&
          areSameUser(circle?.ownerUsername ?? "", normalizedUsername)
        );
      }),
    )
      .map(attachCircle)
      .filter((request): request is CircleJoinRequestWithCircle =>
        Boolean(request),
      ),
    outgoingJoinRequests: sortJoinRequests(
      pendingJoinRequests.filter((request) =>
        areSameUser(request.fromUsername, normalizedUsername),
      ),
    )
      .map(attachCircle)
      .filter((request): request is CircleJoinRequestWithCircle =>
        Boolean(request),
      ),
  };
}

export async function createCircle(
  ownerUsername: string,
  circleInput: {
    description: string;
    memberUsernames: string[];
    name: string;
  },
): Promise<CreateCircleResult> {
  const name = circleInput.name.trim();
  const description = circleInput.description.trim();

  if (name.length < 2 || name.length > circleNameLimit) {
    return {
      circle: null,
      error: `Circle name must be 2-${circleNameLimit} characters.`,
    };
  }

  if (description.length > circleDescriptionLimit) {
    return {
      circle: null,
      error: `Description must be ${circleDescriptionLimit} characters or fewer.`,
    };
  }

  const friendUsernames = await getFriendUsernames(ownerUsername);

  if (friendUsernames.length === 0) {
    return {
      circle: null,
      error: "Add accepted friends before creating a circle.",
    };
  }

  const friendsByUsername = new Map(
    friendUsernames.map((friendUsername) => [
      friendUsername.toLowerCase(),
      friendUsername,
    ]),
  );
  const selectedFriendUsernames = getUniqueCleanValues(
    circleInput.memberUsernames,
  );
  const invalidFriendUsername = selectedFriendUsernames.find(
    (friendUsername) => !friendsByUsername.has(friendUsername),
  );

  if (invalidFriendUsername) {
    return {
      circle: null,
      error: "Circles can only include accepted friends.",
    };
  }

  const memberUsernames = selectedFriendUsernames
    .map((friendUsername) => friendsByUsername.get(friendUsername))
    .filter((friendUsername): friendUsername is string => Boolean(friendUsername));

  if (memberUsernames.length === 0) {
    return {
      circle: null,
      error: "Choose at least one friend for this circle.",
    };
  }

  const data = await readCircleData();

  if (
    data.circles.some(
      (circle) => normalizeCircleName(circle.name) === normalizeCircleName(name),
    )
  ) {
    return {
      circle: null,
      error: "A circle with this name already exists.",
    };
  }

  const circle: Circle = {
    id: randomUUID(),
    name,
    ownerUsername,
    memberUsernames: [ownerUsername, ...memberUsernames],
    description,
    createdAt: new Date().toISOString(),
  };

  await writeCircleData({
    ...data,
    circles: [circle, ...data.circles],
  });

  return {
    circle,
    error: "",
  };
}

export async function deleteCircle(
  username: string,
  circleId: string,
): Promise<CircleMutationResult> {
  const data = await readCircleData();
  const circle = data.circles.find(
    (currentCircle) => currentCircle.id === circleId,
  );

  if (!circle) {
    return {
      circle: null,
      error: "Circle was not found.",
    };
  }

  if (!areSameUser(circle.ownerUsername, username)) {
    return {
      circle: null,
      error: "Only the circle creator can delete this circle.",
    };
  }

  await Promise.all(
    data.messages
      .filter((message) => message.circleId === circle.id)
      .map((message) => deleteMediaAttachment(message.imageAttachment)),
  );

  await writeCircleData({
    circles: data.circles.filter(
      (currentCircle) => currentCircle.id !== circle.id,
    ),
    joinRequests: data.joinRequests.filter(
      (request) => request.circleId !== circle.id,
    ),
    messages: data.messages.filter((message) => message.circleId !== circle.id),
  });

  return {
    circle,
    error: "",
  };
}

export async function leaveCircle(
  username: string,
  circleId: string,
): Promise<CircleMutationResult> {
  const data = await readCircleData();
  const circle = data.circles.find(
    (currentCircle) => currentCircle.id === circleId,
  );

  if (!circle) {
    return {
      circle: null,
      error: "Circle was not found.",
    };
  }

  if (!isMember(circle, username)) {
    return {
      circle: null,
      error: "You are not a member of this circle.",
    };
  }

  if (areSameUser(circle.ownerUsername, username)) {
    return {
      circle: null,
      error: "Circle creators can delete the circle instead of leaving it.",
    };
  }

  const updatedCircle: Circle = {
    ...circle,
    memberUsernames: circle.memberUsernames.filter(
      (memberUsername) => !areSameUser(memberUsername, username),
    ),
  };

  await writeCircleData({
    ...data,
    circles: data.circles.map((currentCircle) =>
      currentCircle.id === circle.id ? updatedCircle : currentCircle,
    ),
    joinRequests: data.joinRequests.filter(
      (request) =>
        request.circleId !== circle.id ||
        !areSameUser(request.fromUsername, username),
    ),
  });

  return {
    circle: updatedCircle,
    error: "",
  };
}

export async function sendCircleJoinRequest(
  fromUsername: string,
  circleId: string,
): Promise<CircleJoinRequestResult> {
  const data = await readCircleData();
  const circle = data.circles.find(
    (currentCircle) => currentCircle.id === circleId,
  );

  if (!circle) {
    return {
      circle: null,
      error: "Circle was not found.",
      request: null,
    };
  }

  return createCircleJoinRequest(data, circle, fromUsername, {
    requireOwnerFriend: true,
  });
}

export async function sendCircleJoinRequestByName(
  fromUsername: string,
  circleName: string,
): Promise<CircleJoinRequestResult> {
  const cleanCircleName = circleName.trim();

  if (cleanCircleName.length < 2) {
    return {
      circle: null,
      error: "Circle name must be at least 2 characters.",
      request: null,
    };
  }

  const data = await readCircleData();
  const matchingCircles = data.circles.filter(
    (circle) =>
      normalizeCircleName(circle.name) === normalizeCircleName(cleanCircleName),
  );

  if (matchingCircles.length === 0) {
    return {
      circle: null,
      error: "No circle was found with that name.",
      request: null,
    };
  }

  if (matchingCircles.length > 1) {
    return {
      circle: null,
      error: "More than one circle uses that name. Ask the creator for a unique circle name.",
      request: null,
    };
  }

  return createCircleJoinRequest(data, matchingCircles[0], fromUsername, {
    requireOwnerFriend: false,
  });
}

export async function respondToCircleJoinRequest(
  username: string,
  requestId: string,
  action: "accept" | "decline",
): Promise<CircleJoinRequestResult> {
  const data = await readCircleData();
  const request = data.joinRequests.find(
    (currentRequest) => currentRequest.id === requestId,
  );

  if (!request) {
    return {
      circle: null,
      error: "Circle join request was not found.",
      request: null,
    };
  }

  if (!areSameUser(request.toUsername, username)) {
    return {
      circle: null,
      error: "Only the circle creator can respond to this request.",
      request: null,
    };
  }

  if (request.status !== "pending") {
    return {
      circle: null,
      error: "This circle join request has already been handled.",
      request,
    };
  }

  const circle = data.circles.find(
    (currentCircle) => currentCircle.id === request.circleId,
  );

  if (!circle) {
    return {
      circle: null,
      error: "Circle was not found.",
      request: null,
    };
  }

  if (!areSameUser(circle.ownerUsername, username)) {
    return {
      circle,
      error: "Only the circle creator can respond to this request.",
      request: null,
    };
  }

  const respondedRequest: CircleJoinRequest = {
    ...request,
    status: action === "accept" ? "accepted" : "declined",
    respondedAt: new Date().toISOString(),
  };
  const updatedCircle: Circle =
    action === "accept" && !isMember(circle, request.fromUsername)
      ? {
          ...circle,
          memberUsernames: [...circle.memberUsernames, request.fromUsername],
        }
      : circle;

  await writeCircleData({
    ...data,
    circles: data.circles.map((currentCircle) =>
      currentCircle.id === circle.id ? updatedCircle : currentCircle,
    ),
    joinRequests: data.joinRequests.map((currentRequest) =>
      currentRequest.id === respondedRequest.id
        ? respondedRequest
        : currentRequest,
    ),
  });

  return {
    circle: updatedCircle,
    error: "",
    request: respondedRequest,
  };
}

export async function getCircleByIdForUser(username: string, circleId: string) {
  const data = await readCircleMetaData();

  return (
    data.circles.find(
      (circle) => circle.id === circleId && isMember(circle, username),
    ) ?? null
  );
}

export async function getCircleMessageNotificationsForUser(username: string) {
  const metadata = await readCircleMetaData();
  const circles = metadata.circles.filter((circle) => isMember(circle, username));
  const circleById = new Map(circles.map((circle) => [circle.id, circle]));

  if (circleById.size === 0) {
    return [];
  }

  const messages = shouldUseTurso()
    ? await readTursoCircleMessagesForCircles(
        Array.from(circleById.keys()),
        username,
        circleMessageNotificationLimit,
      )
    : sortMessagesAscending(
        (await readCircleData()).messages.filter(
          (message) =>
            circleById.has(message.circleId) &&
            !areSameUser(message.fromUsername, username),
        ),
      )
        .reverse()
        .slice(0, circleMessageNotificationLimit);

  return messages
    .map((message) => {
      const circle = circleById.get(message.circleId);

      return circle
        ? {
            circle,
            message,
          }
        : null;
    })
    .filter(
      (
        notification,
      ): notification is { circle: Circle; message: CircleMessage } =>
        Boolean(notification),
    );
}

export async function getCircleChatThread(
  username: string,
  circleId: string,
): Promise<CircleThreadResult> {
  if (shouldUseTurso()) {
    const data = await readCircleMetaData();
    const circle = data.circles.find(
      (currentCircle) =>
        currentCircle.id === circleId && isMember(currentCircle, username),
    );

    if (!circle) {
      return {
        error: "Circle was not found.",
        thread: null,
      };
    }

    return {
      error: "",
      thread: {
        circle,
        messages: await readTursoCircleMessagesForCircle(circle.id),
      },
    };
  }

  const data = await readCircleData();
  const circle = data.circles.find(
    (currentCircle) =>
      currentCircle.id === circleId && isMember(currentCircle, username),
  );

  if (!circle) {
    return {
      error: "Circle was not found.",
      thread: null,
    };
  }

  return {
    error: "",
    thread: {
      circle,
      messages: sortMessagesAscending(
        data.messages.filter((message) => message.circleId === circle.id),
      ),
    },
  };
}

export async function getCircleMessageForReport(
  username: string,
  messageId: string,
): Promise<CircleMessageMutationResult & { circle: Circle | null }> {
  if (shouldUseTurso()) {
    const existingMessage = await findTursoCircleMessageById(messageId);

    if (!existingMessage) {
      return {
        circle: null,
        error: "Message could not be found.",
        message: null,
      };
    }

    const data = await readCircleMetaData();
    const circle = data.circles.find(
      (currentCircle) =>
        currentCircle.id === existingMessage.circleId &&
        isMember(currentCircle, username),
    );

    if (!circle) {
      return {
        circle: null,
        error: "You can only report messages from your own circles.",
        message: null,
      };
    }

    if (areSameUser(existingMessage.fromUsername, username)) {
      return {
        circle,
        error: "You cannot report your own message.",
        message: null,
      };
    }

    return {
      circle,
      error: "",
      message: existingMessage,
    };
  }

  const data = await readCircleData();
  const existingMessage = data.messages.find(
    (currentMessage) => currentMessage.id === messageId,
  );

  if (!existingMessage) {
    return {
      circle: null,
      error: "Message could not be found.",
      message: null,
    };
  }

  const circle = data.circles.find(
    (currentCircle) =>
      currentCircle.id === existingMessage.circleId &&
      isMember(currentCircle, username),
  );

  if (!circle) {
    return {
      circle: null,
      error: "You can only report messages from your own circles.",
      message: null,
    };
  }

  if (areSameUser(existingMessage.fromUsername, username)) {
    return {
      circle,
      error: "You cannot report your own message.",
      message: null,
    };
  }

  return {
    circle,
    error: "",
    message: existingMessage,
  };
}

export async function sendCircleMessage(
  fromUsername: string,
  circleId: string,
  message: string,
  imageAttachment: ChatMediaAttachment | null = null,
): Promise<SendCircleMessageResult> {
  const cleanMessage = message.trim();
  const cleanImageAttachment = imageAttachment ?? null;

  if (!cleanMessage && !cleanImageAttachment) {
    return {
      error: "Add a message, image, or video before sending.",
      message: null,
    };
  }

  if (cleanMessage.length > circleMessageLimit) {
    return {
      error: `Message must be ${circleMessageLimit} characters or fewer.`,
      message: null,
    };
  }

  const data = shouldUseTurso()
    ? { ...(await readCircleMetaData()), messages: [] }
    : await readCircleData();
  const circle = data.circles.find(
    (currentCircle) =>
      currentCircle.id === circleId && isMember(currentCircle, fromUsername),
  );

  if (!circle) {
    return {
      error: "Circle was not found.",
      message: null,
    };
  }

  const messageId = randomUUID();
  let storedImageAttachment: ChatMediaAttachment | null = null;

  try {
    storedImageAttachment = await prepareStoredCircleAttachment(
      cleanImageAttachment,
      messageId,
    );
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Media could not be uploaded. Try again.",
      message: null,
    };
  }

  const circleMessage: CircleMessage = {
    id: messageId,
    circleId: circle.id,
    fromUsername,
    message: cleanMessage,
    ...(storedImageAttachment
      ? { imageAttachment: storedImageAttachment }
      : {}),
    createdAt: new Date().toISOString(),
  };

  try {
    if (shouldUseTurso()) {
      await insertTursoCircleMessage(circleMessage);
    } else {
      await writeCircleData({
        ...data,
        messages: [circleMessage, ...data.messages],
      });
    }
  } catch (error) {
    if (storedImageAttachment?.cloudinaryPublicId) {
      await deleteMediaAttachment(storedImageAttachment);
    }

    throw error;
  }

  return {
    error: "",
    message: circleMessage,
  };
}

export async function editCircleMessage(
  username: string,
  messageId: string,
  message: string,
  imageAttachment: ChatMediaAttachment | null | undefined = undefined,
): Promise<CircleMessageMutationResult> {
  const cleanMessage = message.trim();

  if (cleanMessage.length > circleMessageLimit) {
    return {
      error: `Message must be ${circleMessageLimit} characters or fewer.`,
      message: null,
    };
  }

  const data = shouldUseTurso()
    ? { ...(await readCircleMetaData()), messages: [] }
    : await readCircleData();
  const existingMessage = shouldUseTurso()
    ? await findTursoCircleMessageById(messageId)
    : data.messages.find((currentMessage) => currentMessage.id === messageId);

  if (!existingMessage) {
    return {
      error: "Message was not found.",
      message: null,
    };
  }

  const nextImageAttachment =
    imageAttachment === undefined
      ? existingMessage.imageAttachment ?? null
      : imageAttachment;

  if (!cleanMessage && !nextImageAttachment) {
    return {
      error: "Add a message, image, or video before saving.",
      message: null,
    };
  }

  const circle = data.circles.find(
    (currentCircle) =>
      currentCircle.id === existingMessage.circleId &&
      isMember(currentCircle, username),
  );

  if (!circle) {
    return {
      error: "Circle was not found.",
      message: null,
    };
  }

  if (!areSameUser(existingMessage.fromUsername, username)) {
    return {
      error: "You can only edit your own messages.",
      message: null,
    };
  }

  let storedNextImageAttachment: ChatMediaAttachment | null = null;

  try {
    storedNextImageAttachment = await prepareStoredCircleAttachment(
      nextImageAttachment,
      existingMessage.id,
    );
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Media could not be uploaded. Try again.",
      message: null,
    };
  }

  const updatedMessage: CircleMessage = {
    id: existingMessage.id,
    circleId: existingMessage.circleId,
    fromUsername: existingMessage.fromUsername,
    message: cleanMessage,
    ...(storedNextImageAttachment
      ? { imageAttachment: storedNextImageAttachment }
      : {}),
    createdAt: existingMessage.createdAt,
    editedAt: new Date().toISOString(),
  };

  try {
    if (shouldUseTurso()) {
      await insertTursoCircleMessage(updatedMessage);
    } else {
      await writeCircleData({
        ...data,
        messages: data.messages.map((currentMessage) =>
          currentMessage.id === messageId ? updatedMessage : currentMessage,
        ),
      });
    }
  } catch (error) {
    if (
      storedNextImageAttachment?.cloudinaryPublicId &&
      storedNextImageAttachment.cloudinaryPublicId !==
        existingMessage.imageAttachment?.cloudinaryPublicId
    ) {
      await deleteMediaAttachment(storedNextImageAttachment);
    }

    throw error;
  }

  if (
    didReplaceStoredAttachment(
      existingMessage.imageAttachment,
      storedNextImageAttachment,
    )
  ) {
    await deleteMediaAttachment(existingMessage.imageAttachment);
  }

  return {
    error: "",
    message: updatedMessage,
  };
}

export async function deleteCircleMessage(
  username: string,
  messageId: string,
): Promise<DeleteCircleMessageResult> {
  const data = shouldUseTurso()
    ? { ...(await readCircleMetaData()), messages: [] }
    : await readCircleData();
  const existingMessage = shouldUseTurso()
    ? await findTursoCircleMessageById(messageId)
    : data.messages.find((currentMessage) => currentMessage.id === messageId);

  if (!existingMessage) {
    return {
      error: "Message was not found.",
    };
  }

  const circle = data.circles.find(
    (currentCircle) =>
      currentCircle.id === existingMessage.circleId &&
      isMember(currentCircle, username),
  );

  if (!circle) {
    return {
      error: "Circle was not found.",
    };
  }

  if (!areSameUser(existingMessage.fromUsername, username)) {
    return {
      error: "You can only delete your own messages.",
    };
  }

  if (shouldUseTurso()) {
    await deleteTursoCircleMessage(messageId);
  } else {
    await writeCircleData({
      ...data,
      messages: data.messages.filter(
        (currentMessage) => currentMessage.id !== messageId,
      ),
    });
  }

  await deleteMediaAttachment(existingMessage.imageAttachment);

  return {
    error: "",
  };
}

export async function getCircleRecipientsForUser(
  username: string,
  requestedCircleIds: unknown,
): Promise<CircleRecipientsResult> {
  if (!Array.isArray(requestedCircleIds)) {
    return {
      circleIds: [],
      circles: [],
      error: "Choose at least one circle.",
      recipients: [],
    };
  }

  const selectedCircleIds = getUniqueCleanValues(
    requestedCircleIds.filter(
      (circleId): circleId is string => typeof circleId === "string",
    ),
  );

  if (selectedCircleIds.length === 0) {
    return {
      circleIds: [],
      circles: [],
      error: "Choose at least one circle.",
      recipients: [],
    };
  }

  const circles = await getCirclesForUser(username);
  const circlesById = new Map(circles.map((circle) => [circle.id, circle]));
  const invalidCircleId = selectedCircleIds.find(
    (circleId) => !circlesById.has(circleId),
  );

  if (invalidCircleId) {
    return {
      circleIds: [],
      circles: [],
      error: "You can only share with circles you belong to.",
      recipients: [],
    };
  }

  const selectedCircles = selectedCircleIds
    .map((circleId) => circlesById.get(circleId))
    .filter((circle): circle is Circle => Boolean(circle));
  const recipients = Array.from(
    new Set(
      selectedCircles
        .flatMap((circle) => circle.memberUsernames)
        .filter((memberUsername) => !areSameUser(memberUsername, username)),
    ),
  );

  if (recipients.length === 0) {
    return {
      circleIds: [],
      circles: [],
      error: "Choose a circle with at least one other member.",
      recipients: [],
    };
  }

  return {
    circleIds: selectedCircles.map((circle) => circle.id),
    circles: selectedCircles,
    error: "",
    recipients,
  };
}
