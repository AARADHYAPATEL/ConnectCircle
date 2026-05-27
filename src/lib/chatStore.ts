import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Pool, type QueryResultRow } from "pg";
import { getFriendUsernames } from "@/lib/connectionStore";
import type { ChatMediaAttachment } from "@/lib/chatImageAttachments";
import {
  chatMessageLimit,
  isChatMessage,
  type ChatMessage,
  type ChatOverview,
  type ChatThread,
} from "@/lib/chatTypes";

const dataDirectory = path.join(process.cwd(), ".data");
const chatMessagesFile = path.join(dataDirectory, "chat-messages.json");
const chatMessagesTable = "connectcircle_chat_messages";

let pool: Pool | null = null;
let hasEnsuredPostgresSchema = false;

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
  image_attachment: unknown;
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
    !shouldUsePostgres() &&
    (process.env.VERCEL === "1" ||
      process.env.CONNECTCIRCLE_REQUIRE_DATABASE === "true")
  ) {
    throw new Error(
      "ConnectCircle chat storage is not configured. Set DATABASE_URL or POSTGRES_URL before running in production.",
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

async function readPostgresChatMessages() {
  await ensurePostgresSchema();

  const result = await getPool().query<ChatMessageRow>(
    `
      SELECT id, from_username, to_username, message, image_attachment, created_at, edited_at
      FROM ${chatMessagesTable}
      ORDER BY created_at DESC
    `,
  );

  return result.rows.map(rowToChatMessage);
}

async function writePostgresChatMessages(messages: ChatMessage[]) {
  await ensurePostgresSchema();

  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM ${chatMessagesTable}`);

    for (const message of messages) {
      await client.query(
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

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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

async function readChatMessages() {
  return shouldUsePostgres() ? readPostgresChatMessages() : readJsonChatMessages();
}

async function writeChatMessages(messages: ChatMessage[]) {
  if (shouldUsePostgres()) {
    await writePostgresChatMessages(messages);
    return;
  }

  await writeJsonChatMessages(messages);
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
  const [friendUsernames, messages] = await Promise.all([
    getFriendUsernames(username),
    readChatMessages(),
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

  const messages = await readChatMessages();

  return {
    error: "",
    thread: {
      friendUsername: acceptedFriendUsername,
      messages: sortMessagesAscending(
        messages.filter((message) =>
          isBetweenUsers(message, username, acceptedFriendUsername),
        ),
      ),
    },
  };
}

export async function getChatMessageForReport(
  username: string,
  messageId: string,
): Promise<ChatMessageMutationResult> {
  const messages = await readChatMessages();
  const existingMessage = messages.find(
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
  const messages = await readChatMessages();

  await writeChatMessages([chatMessage, ...messages]);

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

  const messages = await readChatMessages();
  const existingMessage = messages.find(
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

  await writeChatMessages(
    messages.map((currentMessage) =>
      currentMessage.id === messageId ? updatedMessage : currentMessage,
    ),
  );

  return {
    error: "",
    message: updatedMessage,
  };
}

export async function deleteChatMessage(
  username: string,
  messageId: string,
): Promise<DeleteChatMessageResult> {
  const messages = await readChatMessages();
  const existingMessage = messages.find(
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

  await writeChatMessages(
    messages.filter((currentMessage) => currentMessage.id !== messageId),
  );

  return {
    error: "",
  };
}
