import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Row as TursoRow } from "@libsql/client";
import { Pool, type QueryResultRow } from "pg";
import { getFriendUsernames } from "@/lib/connectionStore";
import {
  isChatMediaAttachment,
  type ChatMediaAttachment,
} from "@/lib/chatImageAttachments";
import {
  chatMessageLimit,
  isChatMessage,
  type ChatMessage,
  type ChatOverview,
  type ChatThread,
} from "@/lib/chatTypes";
import { getTursoClient, shouldUseTurso } from "@/lib/tursoStore";

const dataDirectory = path.join(process.cwd(), ".data");
const chatMessagesFile = path.join(dataDirectory, "chat-messages.json");
const chatMessagesTable = "connectcircle_chat_messages";

let pool: Pool | null = null;
let hasEnsuredPostgresSchema = false;
let hasEnsuredTursoSchema = false;

type ChatThreadResult = {
  error: string;
  thread: ChatThread | null;
};

type SendChatMessageResult = {
  error: string;
  message: ChatMessage | null;
};

type ChatMessageMutationResult = {
  error: string;
  message: ChatMessage | null;
};

type DeleteChatMessageResult = {
  error: string;
};

type ChatMessageRow = QueryResultRow & {
  id: string;
  from_username: string;
  to_username: string;
  message: string;
  image_attachment?: unknown;
  created_at: Date | string;
  edited_at: Date | string | null;
};

function areSameUser(firstUsername: string, secondUsername: string) {
  return firstUsername.trim().toLowerCase() === secondUsername.trim().toLowerCase();
}

function isBetweenUsers(
  message: ChatMessage,
  firstUsername: string,
  secondUsername: string,
) {
  return (
    (areSameUser(message.fromUsername, firstUsername) &&
      areSameUser(message.toUsername, secondUsername)) ||
    (areSameUser(message.fromUsername, secondUsername) &&
      areSameUser(message.toUsername, firstUsername))
  );
}

function getPostgresConnectionString() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    ""
  );
}

function normalizePostgresSslMode(connectionString: string) {
  if (!connectionString) {
    return connectionString;
  }

  try {
    const url = new URL(connectionString);
    const sslMode = url.searchParams.get("sslmode");

    if (
      sslMode === "prefer" ||
      sslMode === "require" ||
      sslMode === "verify-ca"
    ) {
      url.searchParams.set("sslmode", "verify-full");
      return url.toString();
    }
  } catch {
    return connectionString;
  }

  return connectionString;
}

function shouldUsePostgres() {
  return Boolean(getPostgresConnectionString());
}

function assertProductionChatStoreConfigured() {
  if (
    !shouldUseTurso() &&
    !shouldUsePostgres() &&
    (process.env.VERCEL === "1" ||
      process.env.CONNECTCIRCLE_REQUIRE_DATABASE === "true")
  ) {
    throw new Error(
      "ConnectCircle chat storage is not configured. Set TURSO_DATABASE_URL, DATABASE_URL, or POSTGRES_URL before running in production.",
    );
  }
}

function getPool() {
  const connectionString = normalizePostgresSslMode(
    getPostgresConnectionString(),
  );

  if (!connectionString) {
    throw new Error("Postgres connection string is not configured.");
  }

  if (!pool) {
    pool = new Pool({
      connectionString,
      max: 5,
    });
  }

  return pool;
}

async function ensurePostgresSchema() {
  if (hasEnsuredPostgresSchema) {
    return;
  }

  await getPool().query(`
    CREATE TABLE IF NOT EXISTS ${chatMessagesTable} (
      id text PRIMARY KEY,
      from_username text NOT NULL,
      to_username text NOT NULL,
      message text NOT NULL,
      image_attachment jsonb,
      created_at timestamptz NOT NULL,
      edited_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS connectcircle_chat_messages_users_idx
      ON ${chatMessagesTable} (from_username, to_username, created_at);

    CREATE INDEX IF NOT EXISTS connectcircle_chat_messages_created_idx
      ON ${chatMessagesTable} (created_at);
  `);

  hasEnsuredPostgresSchema = true;
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

function rowToChatMessage(row: ChatMessageRow): ChatMessage {
  const message: ChatMessage = {
    id: row.id,
    fromUsername: row.from_username,
    toUsername: row.to_username,
    message: row.message,
    createdAt: toIsoString(row.created_at),
    ...(row.edited_at ? { editedAt: toIsoString(row.edited_at) } : {}),
  };
  const candidateMessage = {
    ...message,
    ...(row.image_attachment ? { imageAttachment: row.image_attachment } : {}),
  };

  return isChatMessage(candidateMessage) ? candidateMessage : message;
}

function chatMessageToPostgresValues(message: ChatMessage) {
  return [
    message.id,
    message.fromUsername,
    message.toUsername,
    message.message,
    message.imageAttachment ? JSON.stringify(message.imageAttachment) : null,
    message.createdAt,
    message.editedAt ?? null,
  ];
}

async function readPostgresChatMessagesForUsername(username: string) {
  await ensurePostgresSchema();

  const result = await getPool().query<ChatMessageRow>(
    `
      SELECT id, from_username, to_username, message, created_at, edited_at
      FROM ${chatMessagesTable}
      WHERE from_username = $1 OR to_username = $1
      ORDER BY created_at DESC
    `,
    [username],
  );

  return result.rows.map(rowToChatMessage);
}

async function readPostgresChatMessagesBetweenUsers(
  firstUsername: string,
  secondUsername: string,
) {
  await ensurePostgresSchema();

  const result = await getPool().query<ChatMessageRow>(
    `
      SELECT id, from_username, to_username, message, image_attachment, created_at, edited_at
      FROM ${chatMessagesTable}
      WHERE (
        from_username = $1 AND to_username = $2
      ) OR (
        from_username = $2 AND to_username = $1
      )
      ORDER BY created_at ASC
    `,
    [firstUsername, secondUsername],
  );

  return result.rows.map(rowToChatMessage);
}

async function findPostgresChatMessageById(messageId: string) {
  await ensurePostgresSchema();

  const result = await getPool().query<ChatMessageRow>(
    `
      SELECT id, from_username, to_username, message, image_attachment, created_at, edited_at
      FROM ${chatMessagesTable}
      WHERE id = $1
      LIMIT 1
    `,
    [messageId],
  );

  const [row] = result.rows;

  return row ? rowToChatMessage(row) : null;
}

async function insertPostgresChatMessage(message: ChatMessage) {
  await ensurePostgresSchema();

  await getPool().query(
    `
      INSERT INTO ${chatMessagesTable} (
        id,
        from_username,
        to_username,
        message,
        image_attachment,
        created_at,
        edited_at
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
    `,
    chatMessageToPostgresValues(message),
  );
}

async function updatePostgresChatMessage(message: ChatMessage) {
  await ensurePostgresSchema();

  await getPool().query(
    `
      UPDATE ${chatMessagesTable}
      SET
        message = $2,
        image_attachment = $3::jsonb,
        created_at = $4,
        edited_at = $5,
        updated_at = now()
      WHERE id = $1
    `,
    [
      message.id,
      message.message,
      message.imageAttachment ? JSON.stringify(message.imageAttachment) : null,
      message.createdAt,
      message.editedAt ?? null,
    ],
  );
}

async function deletePostgresChatMessage(messageId: string) {
  await ensurePostgresSchema();

  await getPool().query(`DELETE FROM ${chatMessagesTable} WHERE id = $1`, [
    messageId,
  ]);
}

function tursoBlobValueToBuffer(value: unknown) {
  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }

  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }

  return null;
}

function tursoRowString(row: TursoRow, key: string) {
  const value = row[key];

  return typeof value === "string" ? value : String(value ?? "");
}

function tursoRowOptionalString(row: TursoRow, key: string) {
  const value = row[key];

  return typeof value === "string" && value ? value : null;
}

function tursoRowOptionalNumber(row: TursoRow, key: string) {
  const value = row[key];

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string") {
    const parsedValue = Number.parseInt(value, 10);

    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  return null;
}

function chatAttachmentToBytes(attachment: ChatMediaAttachment) {
  const prefix = `data:${attachment.type};base64,`;

  if (!attachment.dataUrl.startsWith(prefix)) {
    return null;
  }

  return new Uint8Array(Buffer.from(attachment.dataUrl.slice(prefix.length), "base64"));
}

function tursoRowToChatAttachment(row: TursoRow) {
  const name = tursoRowOptionalString(row, "media_name");
  const type = tursoRowOptionalString(row, "media_type");
  const size = tursoRowOptionalNumber(row, "media_size");
  const data = tursoBlobValueToBuffer(row.media_data);

  if (!name || !type || !size || !data) {
    return null;
  }

  const candidateAttachment = {
    dataUrl: `data:${type};base64,${data.toString("base64")}`,
    kind: type.startsWith("video/") ? "video" : "image",
    name,
    size,
    type,
  };

  return isChatMediaAttachment(candidateAttachment)
    ? candidateAttachment
    : null;
}

function rowToTursoChatMessage(
  row: TursoRow,
  options: { includeMediaData: boolean },
): ChatMessage {
  const message: ChatMessage = {
    id: tursoRowString(row, "id"),
    fromUsername: tursoRowString(row, "from_username"),
    toUsername: tursoRowString(row, "to_username"),
    message: tursoRowString(row, "message"),
    createdAt: tursoRowString(row, "created_at"),
    ...(tursoRowOptionalString(row, "edited_at")
      ? { editedAt: tursoRowString(row, "edited_at") }
      : {}),
  };
  const imageAttachment = options.includeMediaData
    ? tursoRowToChatAttachment(row)
    : null;
  const candidateMessage = {
    ...message,
    ...(imageAttachment ? { imageAttachment } : {}),
  };

  return isChatMessage(candidateMessage) ? candidateMessage : message;
}

function chatMessageToTursoValues(message: ChatMessage) {
  const attachment = message.imageAttachment ?? null;
  const attachmentBytes = attachment ? chatAttachmentToBytes(attachment) : null;

  return [
    message.id,
    message.fromUsername,
    message.toUsername,
    message.message,
    attachment?.name ?? null,
    attachment?.type ?? null,
    attachment?.size ?? null,
    attachmentBytes,
    message.createdAt,
    message.editedAt ?? null,
    new Date().toISOString(),
  ];
}

async function ensureTursoSchema() {
  if (hasEnsuredTursoSchema) {
    return;
  }

  await getTursoClient().executeMultiple(`
    CREATE TABLE IF NOT EXISTS ${chatMessagesTable} (
      id TEXT PRIMARY KEY,
      from_username TEXT NOT NULL,
      to_username TEXT NOT NULL,
      message TEXT NOT NULL,
      media_name TEXT,
      media_type TEXT,
      media_size INTEGER,
      media_data BLOB,
      created_at TEXT NOT NULL,
      edited_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS connectcircle_chat_messages_users_idx
      ON ${chatMessagesTable} (from_username, to_username, created_at);

    CREATE INDEX IF NOT EXISTS connectcircle_chat_messages_created_idx
      ON ${chatMessagesTable} (created_at);
  `);

  hasEnsuredTursoSchema = true;
}

async function readTursoChatMessagesForUsername(username: string) {
  await ensureTursoSchema();

  const result = await getTursoClient().execute({
    sql: `
      SELECT id, from_username, to_username, message, created_at, edited_at
      FROM ${chatMessagesTable}
      WHERE from_username = ? OR to_username = ?
      ORDER BY created_at DESC
    `,
    args: [username, username],
  });

  return result.rows.map((row) =>
    rowToTursoChatMessage(row, { includeMediaData: false }),
  );
}

async function readTursoChatMessagesBetweenUsers(
  firstUsername: string,
  secondUsername: string,
) {
  await ensureTursoSchema();

  const result = await getTursoClient().execute({
    sql: `
      SELECT
        id,
        from_username,
        to_username,
        message,
        media_name,
        media_type,
        media_size,
        media_data,
        created_at,
        edited_at
      FROM ${chatMessagesTable}
      WHERE (
        from_username = ? AND to_username = ?
      ) OR (
        from_username = ? AND to_username = ?
      )
      ORDER BY created_at ASC
    `,
    args: [firstUsername, secondUsername, secondUsername, firstUsername],
  });

  return result.rows.map((row) =>
    rowToTursoChatMessage(row, { includeMediaData: true }),
  );
}

async function findTursoChatMessageById(messageId: string) {
  await ensureTursoSchema();

  const result = await getTursoClient().execute({
    sql: `
      SELECT
        id,
        from_username,
        to_username,
        message,
        media_name,
        media_type,
        media_size,
        media_data,
        created_at,
        edited_at
      FROM ${chatMessagesTable}
      WHERE id = ?
      LIMIT 1
    `,
    args: [messageId],
  });

  const [row] = result.rows;

  return row ? rowToTursoChatMessage(row, { includeMediaData: true }) : null;
}

async function insertTursoChatMessage(message: ChatMessage) {
  await ensureTursoSchema();

  await getTursoClient().execute({
    sql: `
      INSERT INTO ${chatMessagesTable} (
        id,
        from_username,
        to_username,
        message,
        media_name,
        media_type,
        media_size,
        media_data,
        created_at,
        edited_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: chatMessageToTursoValues(message),
  });
}

async function updateTursoChatMessage(message: ChatMessage) {
  await ensureTursoSchema();

  const values = chatMessageToTursoValues(message);

  await getTursoClient().execute({
    sql: `
      UPDATE ${chatMessagesTable}
      SET
        message = ?,
        media_name = ?,
        media_type = ?,
        media_size = ?,
        media_data = ?,
        created_at = ?,
        edited_at = ?,
        updated_at = ?
      WHERE id = ?
    `,
    args: [
      values[3],
      values[4],
      values[5],
      values[6],
      values[7],
      values[8],
      values[9],
      values[10],
      values[0],
    ],
  });
}

async function deleteTursoChatMessage(messageId: string) {
  await ensureTursoSchema();

  await getTursoClient().execute({
    sql: `DELETE FROM ${chatMessagesTable} WHERE id = ?`,
    args: [messageId],
  });
}

async function rewriteJsonChatMessages(messages: ChatMessage[]) {
  await writeJsonChatMessages(messages);
}

async function readJsonChatMessages() {
  assertProductionChatStoreConfigured();

  try {
    const file = await fs.readFile(chatMessagesFile, "utf8");
    const parsed: unknown = JSON.parse(file);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isChatMessage);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function writeJsonChatMessages(messages: ChatMessage[]) {
  assertProductionChatStoreConfigured();
  await fs.mkdir(dataDirectory, { recursive: true });

  const temporaryFile = `${chatMessagesFile}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(messages, null, 2), "utf8");
  await fs.rename(temporaryFile, chatMessagesFile);
}

function sortMessagesAscending(messages: ChatMessage[]) {
  return [...messages].sort(
    (first, second) =>
      new Date(first.createdAt).getTime() -
      new Date(second.createdAt).getTime(),
  );
}

function findAcceptedFriend(friendUsernames: string[], username: string) {
  return friendUsernames.find((friendUsername) =>
    areSameUser(friendUsername, username),
  );
}

export async function getChatOverview(username: string): Promise<ChatOverview> {
  const useTurso = shouldUseTurso();
  const usePostgres = !useTurso && shouldUsePostgres();
  const [friendUsernames, messages] = await Promise.all([
    getFriendUsernames(username),
    useTurso
      ? readTursoChatMessagesForUsername(username)
      : usePostgres
      ? readPostgresChatMessagesForUsername(username)
      : readJsonChatMessages(),
  ]);

  const conversations = friendUsernames
    .map((friendUsername) => {
      const threadMessages = messages.filter((message) =>
        isBetweenUsers(message, username, friendUsername),
      );
      const lastMessage = sortMessagesAscending(threadMessages).at(-1) ?? null;

      return {
        friendUsername,
        lastMessage,
      };
    })
    .sort((first, second) => {
      if (!first.lastMessage && !second.lastMessage) {
        return first.friendUsername.localeCompare(second.friendUsername);
      }

      if (!first.lastMessage) {
        return 1;
      }

      if (!second.lastMessage) {
        return -1;
      }

      return (
        new Date(second.lastMessage.createdAt).getTime() -
        new Date(first.lastMessage.createdAt).getTime()
      );
    });

  return {
    friends: friendUsernames,
    conversations,
  };
}

export async function getChatThread(
  username: string,
  friendUsername: string,
): Promise<ChatThreadResult> {
  const friendUsernames = await getFriendUsernames(username);
  const acceptedFriendUsername = findAcceptedFriend(
    friendUsernames,
    friendUsername,
  );

  if (!acceptedFriendUsername) {
    return {
      error: "You can only chat with accepted friends.",
      thread: null,
    };
  }

  const messages = shouldUseTurso()
    ? await readTursoChatMessagesBetweenUsers(
        username,
        acceptedFriendUsername,
      )
    : shouldUsePostgres()
      ? await readPostgresChatMessagesBetweenUsers(
        username,
        acceptedFriendUsername,
      )
      : (await readJsonChatMessages()).filter((message) =>
          isBetweenUsers(message, username, acceptedFriendUsername),
        );

  return {
    error: "",
    thread: {
      friendUsername: acceptedFriendUsername,
      messages: sortMessagesAscending(messages),
    },
  };
}

export async function getChatMessageForReport(
  username: string,
  messageId: string,
): Promise<ChatMessageMutationResult> {
  const existingMessage = shouldUseTurso()
    ? await findTursoChatMessageById(messageId)
    : shouldUsePostgres()
      ? await findPostgresChatMessageById(messageId)
      : (await readJsonChatMessages()).find(
          (currentMessage) => currentMessage.id === messageId,
        );

  if (!existingMessage) {
    return {
      error: "Message could not be found.",
      message: null,
    };
  }

  if (
    !areSameUser(existingMessage.fromUsername, username) &&
    !areSameUser(existingMessage.toUsername, username)
  ) {
    return {
      error: "You can only report messages from your own conversations.",
      message: null,
    };
  }

  if (areSameUser(existingMessage.fromUsername, username)) {
    return {
      error: "You cannot report your own message.",
      message: null,
    };
  }

  return {
    error: "",
    message: existingMessage,
  };
}

export async function sendChatMessage(
  fromUsername: string,
  toUsername: string,
  message: string,
  imageAttachment: ChatMediaAttachment | null = null,
): Promise<SendChatMessageResult> {
  const cleanMessage = message.trim();
  const cleanImageAttachment = imageAttachment ?? null;

  if (areSameUser(fromUsername, toUsername)) {
    return {
      error: "You cannot chat with yourself.",
      message: null,
    };
  }

  if (!cleanMessage && !cleanImageAttachment) {
    return {
      error: "Add a message, image, or video before sending.",
      message: null,
    };
  }

  if (cleanMessage.length > chatMessageLimit) {
    return {
      error: `Message must be ${chatMessageLimit} characters or fewer.`,
      message: null,
    };
  }

  const friendUsernames = await getFriendUsernames(fromUsername);
  const acceptedFriendUsername = findAcceptedFriend(friendUsernames, toUsername);

  if (!acceptedFriendUsername) {
    return {
      error: "You can only chat with accepted friends.",
      message: null,
    };
  }

  const chatMessage: ChatMessage = {
    id: randomUUID(),
    fromUsername,
    toUsername: acceptedFriendUsername,
    message: cleanMessage,
    ...(cleanImageAttachment
      ? { imageAttachment: cleanImageAttachment }
      : {}),
    createdAt: new Date().toISOString(),
  };

  if (shouldUseTurso()) {
    await insertTursoChatMessage(chatMessage);
  } else if (shouldUsePostgres()) {
    await insertPostgresChatMessage(chatMessage);
  } else {
    const messages = await readJsonChatMessages();

    await rewriteJsonChatMessages([chatMessage, ...messages]);
  }

  return {
    error: "",
    message: chatMessage,
  };
}

export async function editChatMessage(
  username: string,
  messageId: string,
  message: string,
  imageAttachment: ChatMediaAttachment | null | undefined = undefined,
): Promise<ChatMessageMutationResult> {
  const cleanMessage = message.trim();

  if (cleanMessage.length > chatMessageLimit) {
    return {
      error: `Message must be ${chatMessageLimit} characters or fewer.`,
      message: null,
    };
  }

  const useTurso = shouldUseTurso();
  const usePostgres = !useTurso && shouldUsePostgres();
  const existingMessage = useTurso
    ? await findTursoChatMessageById(messageId)
    : usePostgres
      ? await findPostgresChatMessageById(messageId)
      : (await readJsonChatMessages()).find(
          (currentMessage) => currentMessage.id === messageId,
        );

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

  if (!areSameUser(existingMessage.fromUsername, username)) {
    return {
      error: "You can only edit your own messages.",
      message: null,
    };
  }

  const updatedMessage: ChatMessage = {
    id: existingMessage.id,
    fromUsername: existingMessage.fromUsername,
    toUsername: existingMessage.toUsername,
    message: cleanMessage,
    ...(nextImageAttachment ? { imageAttachment: nextImageAttachment } : {}),
    createdAt: existingMessage.createdAt,
    editedAt: new Date().toISOString(),
  };

  if (useTurso) {
    await updateTursoChatMessage(updatedMessage);
  } else if (usePostgres) {
    await updatePostgresChatMessage(updatedMessage);
  } else {
    const messages = await readJsonChatMessages();

    await rewriteJsonChatMessages(
      messages.map((currentMessage) =>
        currentMessage.id === messageId ? updatedMessage : currentMessage,
      ),
    );
  }

  return {
    error: "",
    message: updatedMessage,
  };
}

export async function deleteChatMessage(
  username: string,
  messageId: string,
): Promise<DeleteChatMessageResult> {
  const useTurso = shouldUseTurso();
  const usePostgres = !useTurso && shouldUsePostgres();
  const existingMessage = useTurso
    ? await findTursoChatMessageById(messageId)
    : usePostgres
      ? await findPostgresChatMessageById(messageId)
      : (await readJsonChatMessages()).find(
          (currentMessage) => currentMessage.id === messageId,
        );

  if (!existingMessage) {
    return {
      error: "Message was not found.",
    };
  }

  if (!areSameUser(existingMessage.fromUsername, username)) {
    return {
      error: "You can only delete your own messages.",
    };
  }

  if (useTurso) {
    await deleteTursoChatMessage(messageId);
  } else if (usePostgres) {
    await deletePostgresChatMessage(messageId);
  } else {
    const messages = await readJsonChatMessages();

    await rewriteJsonChatMessages(
      messages.filter((currentMessage) => currentMessage.id !== messageId),
    );
  }

  return {
    error: "",
  };
}
