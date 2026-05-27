import { createClient } from "@libsql/client";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { gzipSync } from "node:zlib";

const documentsTable = "connectcircle_documents";
const chatMessagesTable = "connectcircle_chat_messages";
const dataDirectory = path.join(process.cwd(), ".data");

await loadEnvFile(".env.local");
await loadEnvFile(".env.turso.local", { override: true });

const databaseUrl =
  process.env.TURSO_DATABASE_URL || process.env.LIBSQL_DATABASE_URL || "";
const authToken =
  process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN || "";

if (!databaseUrl) {
  console.error(
    "Missing TURSO_DATABASE_URL. Create a free Turso database, then add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to .env.turso.local.",
  );
  process.exit(1);
}

const client = createClient({
  url: databaseUrl,
  ...(authToken ? { authToken } : {}),
});

try {
  await ensureSchema();

  const documentResults = await migrateDocuments();
  const moodEntryResults = await migrateMoodEntries();
  const chatMessages = await migrateChatMessages();

  const compressedBytes = [...documentResults, ...moodEntryResults].reduce(
    (total, result) => total + result.compressedBytes,
    0,
  );
  const sourceBytes = [...documentResults, ...moodEntryResults].reduce(
    (total, result) => total + result.sourceBytes,
    0,
  );

  console.log(
    `Migrated ${documentResults.length + moodEntryResults.length} compressed document(s).`,
  );
  console.log(
    `Compressed document data from ${formatBytes(sourceBytes)} to ${formatBytes(compressedBytes)}.`,
  );
  console.log(`Migrated ${chatMessages} direct chat message(s).`);
} finally {
  client.close();
}

async function ensureSchema() {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS ${documentsTable} (
      document_key TEXT PRIMARY KEY,
      data_blob BLOB NOT NULL,
      updated_at TEXT NOT NULL
    );

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
}

async function migrateDocuments() {
  const documents = [
    ["admin-login-attempts", "admin-login-attempts.json"],
    ["admin-users", "admin-users.json"],
    ["circles", "circles.json"],
    ["connections", "connections.json"],
    ["feedback", "feedback.json"],
    ["notification-state", "notification-state.json"],
    ["presence", "presence.json"],
    ["reports", "reports.json"],
    ["support-messages", "support-messages.json"],
    ["user-login-attempts", "user-login-attempts.json"],
    ["users", "users.json"],
  ];
  const results = [];

  for (const [documentKey, fileName] of documents) {
    const value = await readJsonIfExists(path.join(dataDirectory, fileName));

    if (value === undefined) {
      continue;
    }

    results.push(await upsertDocument(documentKey, value));
  }

  return results;
}

async function migrateMoodEntries() {
  const groupedEntries = new Map();
  const moodEntryDirectory = path.join(dataDirectory, "mood-entries");

  try {
    const files = await fs.readdir(moodEntryDirectory);

    for (const fileName of files.filter((file) => file.endsWith(".json"))) {
      const username = path.basename(fileName, ".json").trim().toLowerCase();
      const entries = await readJsonIfExists(
        path.join(moodEntryDirectory, fileName),
      );

      if (username && Array.isArray(entries)) {
        addMoodEntries(groupedEntries, username, entries);
      }
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  const legacyEntries = await readJsonIfExists(
    path.join(dataDirectory, "mood-entries.json"),
  );

  if (Array.isArray(legacyEntries)) {
    for (const entry of legacyEntries) {
      if (entry && typeof entry === "object" && typeof entry.username === "string") {
        addMoodEntries(groupedEntries, entry.username.trim().toLowerCase(), [
          entry,
        ]);
      }
    }
  }

  const results = [];

  for (const [username, entriesById] of groupedEntries) {
    results.push(
      await upsertDocument(
        `mood-entries:${username}`,
        Array.from(entriesById.values()),
      ),
    );
  }

  return results;
}

function addMoodEntries(groupedEntries, username, entries) {
  if (!username) {
    return;
  }

  const entriesById = groupedEntries.get(username) ?? new Map();

  for (const entry of entries) {
    if (entry && typeof entry === "object" && typeof entry.id === "string") {
      entriesById.set(entry.id, entry);
    }
  }

  groupedEntries.set(username, entriesById);
}

async function migrateChatMessages() {
  const chatMessages = await readJsonIfExists(
    path.join(dataDirectory, "chat-messages.json"),
  );

  if (!Array.isArray(chatMessages)) {
    return 0;
  }

  const messages = chatMessages.filter(isChatMessage);

  for (const message of messages) {
    await upsertChatMessage(message);
  }

  return messages.length;
}

async function upsertDocument(documentKey, value) {
  const serialized = JSON.stringify(value);
  const compressed = gzipSync(serialized);

  await client.execute({
    sql: `
      INSERT INTO ${documentsTable} (document_key, data_blob, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(document_key) DO UPDATE SET
        data_blob = excluded.data_blob,
        updated_at = excluded.updated_at
    `,
    args: [documentKey, new Uint8Array(compressed), new Date().toISOString()],
  });

  return {
    compressedBytes: compressed.byteLength,
    documentKey,
    sourceBytes: Buffer.byteLength(serialized),
  };
}

async function upsertChatMessage(message) {
  const attachment = message.imageAttachment ?? null;
  const mediaData = attachment ? attachmentToBytes(attachment) : null;

  await client.execute({
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
      ON CONFLICT(id) DO UPDATE SET
        from_username = excluded.from_username,
        to_username = excluded.to_username,
        message = excluded.message,
        media_name = excluded.media_name,
        media_type = excluded.media_type,
        media_size = excluded.media_size,
        media_data = excluded.media_data,
        created_at = excluded.created_at,
        edited_at = excluded.edited_at,
        updated_at = excluded.updated_at
    `,
    args: [
      message.id,
      message.fromUsername,
      message.toUsername,
      message.message,
      attachment?.name ?? null,
      attachment?.type ?? null,
      attachment?.size ?? null,
      mediaData,
      message.createdAt,
      message.editedAt ?? null,
      new Date().toISOString(),
    ],
  });
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

function attachmentToBytes(attachment) {
  const prefix = `data:${attachment.type};base64,`;

  if (!attachment.dataUrl.startsWith(prefix)) {
    return null;
  }

  return new Uint8Array(Buffer.from(attachment.dataUrl.slice(prefix.length), "base64"));
}

function isChatMessage(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    typeof value.fromUsername === "string" &&
    typeof value.toUsername === "string" &&
    typeof value.message === "string" &&
    (value.imageAttachment === undefined ||
      isChatMediaAttachment(value.imageAttachment)) &&
    typeof value.createdAt === "string" &&
    (value.editedAt === undefined || typeof value.editedAt === "string")
  );
}

function isChatMediaAttachment(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.dataUrl === "string" &&
    typeof value.name === "string" &&
    typeof value.size === "number" &&
    typeof value.type === "string" &&
    /^data:((?:image\/(?:jpeg|png|webp|gif))|(?:video\/(?:mp4|webm|ogg)));base64,[A-Za-z0-9+/=]+$/u.test(
      value.dataUrl,
    )
  );
}

async function loadEnvFile(fileName, options = {}) {
  const filePath = path.join(process.cwd(), fileName);

  try {
    const file = await fs.readFile(filePath, "utf8");

    for (const line of file.split(/\r?\n/)) {
      const trimmedLine = line.trim();

      if (!trimmedLine || trimmedLine.startsWith("#")) {
        continue;
      }

      const equalsIndex = trimmedLine.indexOf("=");

      if (equalsIndex === -1) {
        continue;
      }

      const key = trimmedLine.slice(0, equalsIndex).trim();
      const value = parseEnvValue(trimmedLine.slice(equalsIndex + 1).trim());

      if (options.override || !process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

function parseEnvValue(value) {
  const quote = value[0];

  if (
    (quote === "\"" || quote === "'") &&
    value.length >= 2 &&
    value[value.length - 1] === quote
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

