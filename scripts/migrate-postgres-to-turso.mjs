import { createClient } from "@libsql/client";
import { promises as fs } from "node:fs";
import process from "node:process";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;
const documentsTable = "connectcircle_documents";
const chatMessagesTable = "connectcircle_chat_messages";

await loadEnvFile(".env.local");
await loadEnvFile(".env.turso.local", { override: true });

const tursoUrl =
  process.env.TURSO_DATABASE_URL || process.env.LIBSQL_DATABASE_URL || "";
const tursoAuthToken =
  process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN || "";
const postgresUrl =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  "";

if (!tursoUrl) {
  console.error("Missing TURSO_DATABASE_URL.");
  process.exit(1);
}

if (!postgresUrl) {
  console.error("Missing DATABASE_URL or POSTGRES_URL.");
  process.exit(1);
}

const turso = createClient({
  url: tursoUrl,
  ...(tursoAuthToken ? { authToken: tursoAuthToken } : {}),
});
const postgres = new Pool({
  connectionString: normalizePostgresSslMode(postgresUrl),
  max: 1,
});

try {
  await ensureTursoSchema();

  const users = await readPostgresUsers();
  const loginAttempts = await readPostgresUserLoginAttempts();
  const connections = await readPostgresConnections();
  const chatMessages = await readPostgresChatMessages();

  await upsertDocument("users", users);
  await upsertDocument("user-login-attempts", loginAttempts);
  await upsertDocument("connections", connections);

  for (const message of chatMessages) {
    await upsertChatMessage(message);
  }

  console.log(`Migrated ${users.length} user account(s) from Postgres.`);
  console.log(`Migrated ${connections.requests.length} connection request(s).`);
  console.log(`Migrated ${connections.friendships.length} friendship(s).`);
  console.log(`Migrated ${connections.blocks.length} block record(s).`);
  console.log(`Migrated ${chatMessages.length} direct chat message(s).`);
} finally {
  await postgres.end();
  turso.close();
}

async function ensureTursoSchema() {
  await turso.executeMultiple(`
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

async function readPostgresUsers() {
  if (!(await tableExists("connectcircle_users"))) {
    return [];
  }

  const result = await postgres.query(`
    SELECT
      id,
      username,
      email,
      display_name,
      bio,
      avatar_image,
      avatar_url,
      profile_visibility,
      availability_status,
      theme_preference,
      password_hash,
      password_salt,
      password_algorithm,
      google_sub,
      auth_providers,
      created_at
    FROM connectcircle_users
    ORDER BY created_at DESC
  `);

  return result.rows.map((row) => ({
    id: row.id,
    username: row.username,
    email: row.email,
    ...(row.display_name ? { displayName: row.display_name } : {}),
    ...(row.bio ? { bio: row.bio } : {}),
    ...(row.avatar_image ? { avatarImage: row.avatar_image } : {}),
    ...(row.avatar_url ? { avatarUrl: row.avatar_url } : {}),
    ...(row.profile_visibility ? { profileVisibility: row.profile_visibility } : {}),
    ...(row.availability_status ? { availabilityStatus: row.availability_status } : {}),
    ...(row.theme_preference ? { themePreference: row.theme_preference } : {}),
    ...(row.password_hash ? { passwordHash: row.password_hash } : {}),
    ...(row.password_salt ? { passwordSalt: row.password_salt } : {}),
    ...(row.password_algorithm ? { passwordAlgorithm: row.password_algorithm } : {}),
    ...(row.google_sub ? { googleSub: row.google_sub } : {}),
    authProviders: parseAuthProviders(row.auth_providers),
    createdAt: toIsoString(row.created_at),
  }));
}

async function readPostgresUserLoginAttempts() {
  if (!(await tableExists("connectcircle_user_login_attempts"))) {
    return [];
  }

  const result = await postgres.query(`
    SELECT email_key, failed_attempts, first_failed_at, locked_until
    FROM connectcircle_user_login_attempts
    ORDER BY updated_at DESC
  `);

  return result.rows.map((row) => ({
    emailKey: row.email_key,
    failedAttempts: row.failed_attempts,
    firstFailedAt: toIsoString(row.first_failed_at),
    ...(row.locked_until ? { lockedUntil: toIsoString(row.locked_until) } : {}),
  }));
}

async function readPostgresConnections() {
  const data = {
    requests: [],
    friendships: [],
    blocks: [],
  };

  if (await tableExists("connectcircle_connection_requests")) {
    const result = await postgres.query(`
      SELECT id, from_username, to_username, status, created_at, responded_at
      FROM connectcircle_connection_requests
      ORDER BY created_at DESC
    `);

    data.requests = result.rows.map((row) => ({
      id: row.id,
      fromUsername: row.from_username,
      toUsername: row.to_username,
      status: row.status,
      createdAt: toIsoString(row.created_at),
      ...(row.responded_at ? { respondedAt: toIsoString(row.responded_at) } : {}),
    }));
  }

  if (await tableExists("connectcircle_friendships")) {
    const result = await postgres.query(`
      SELECT id, username_first, username_second, created_at, request_id
      FROM connectcircle_friendships
      ORDER BY created_at DESC
    `);

    data.friendships = result.rows.map((row) => ({
      id: row.id,
      usernames: [row.username_first, row.username_second],
      createdAt: toIsoString(row.created_at),
      requestId: row.request_id,
    }));
  }

  if (await tableExists("connectcircle_connection_blocks")) {
    const result = await postgres.query(`
      SELECT id, blocker_username, blocked_username, created_at, removed_from_list_at
      FROM connectcircle_connection_blocks
      ORDER BY created_at DESC
    `);

    data.blocks = result.rows.map((row) => ({
      id: row.id,
      blockerUsername: row.blocker_username,
      blockedUsername: row.blocked_username,
      createdAt: toIsoString(row.created_at),
      ...(row.removed_from_list_at
        ? { removedFromListAt: toIsoString(row.removed_from_list_at) }
        : {}),
    }));
  }

  return data;
}

async function readPostgresChatMessages() {
  if (!(await tableExists("connectcircle_chat_messages"))) {
    return [];
  }

  const result = await postgres.query(`
    SELECT
      id,
      from_username,
      to_username,
      message,
      image_attachment,
      created_at,
      edited_at
    FROM connectcircle_chat_messages
    ORDER BY created_at ASC
  `);

  return result.rows.map((row) => ({
    id: row.id,
    fromUsername: row.from_username,
    toUsername: row.to_username,
    message: row.message,
    ...(row.image_attachment ? { imageAttachment: row.image_attachment } : {}),
    createdAt: toIsoString(row.created_at),
    ...(row.edited_at ? { editedAt: toIsoString(row.edited_at) } : {}),
  }));
}

async function upsertDocument(documentKey, value) {
  const { gzipSync } = await import("node:zlib");
  const compressed = gzipSync(JSON.stringify(value));

  await turso.execute({
    sql: `
      INSERT INTO ${documentsTable} (document_key, data_blob, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(document_key) DO UPDATE SET
        data_blob = excluded.data_blob,
        updated_at = excluded.updated_at
    `,
    args: [documentKey, new Uint8Array(compressed), new Date().toISOString()],
  });
}

async function upsertChatMessage(message) {
  const attachment = isChatMediaAttachment(message.imageAttachment)
    ? message.imageAttachment
    : null;
  const mediaData = attachment ? attachmentToBytes(attachment) : null;

  await turso.execute({
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

async function tableExists(tableName) {
  const result = await postgres.query("SELECT to_regclass($1) AS table_name", [
    tableName,
  ]);

  return Boolean(result.rows[0]?.table_name);
}

function attachmentToBytes(attachment) {
  const prefix = `data:${attachment.type};base64,`;

  if (!attachment.dataUrl.startsWith(prefix)) {
    return null;
  }

  return new Uint8Array(Buffer.from(attachment.dataUrl.slice(prefix.length), "base64"));
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

function parseAuthProviders(value) {
  const providers =
    typeof value === "string"
      ? safeJsonParse(value, [])
      : Array.isArray(value)
        ? value
        : [];

  return providers.filter(
    (provider) => provider === "password" || provider === "google",
  );
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toIsoString(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function normalizePostgresSslMode(value) {
  try {
    const url = new URL(value);
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
    return value;
  }

  return value;
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

