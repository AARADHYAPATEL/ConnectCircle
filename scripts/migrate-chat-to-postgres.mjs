import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Pool } = pg;
const chatMessagesTable = "connectcircle_chat_messages";

await loadEnvFile(".env.local");

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  "";

if (!connectionString) {
  console.error(
    "Missing DATABASE_URL or POSTGRES_URL. Add your Postgres connection string before migrating chat messages.",
  );
  process.exit(1);
}

const chatMessagesFile =
  process.argv[2] || path.join(process.cwd(), ".data", "chat-messages.json");
const messages = await readChatMessages(chatMessagesFile);

if (messages.length === 0) {
  console.log(`No chat messages found in ${chatMessagesFile}.`);
  process.exit(0);
}

const pool = new Pool({
  connectionString: normalizePostgresSslMode(connectionString),
  max: 1,
});

try {
  await ensureSchema(pool);

  for (const message of messages) {
    await upsertChatMessage(pool, message);
  }

  console.log(`Migrated ${messages.length} chat message(s) to Postgres.`);
} finally {
  await pool.end();
}

async function readChatMessages(filePath) {
  const file = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(file);

  if (!Array.isArray(parsed)) {
    throw new Error(`${filePath} must contain a JSON array.`);
  }

  return parsed.filter(isChatMessage);
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

async function ensureSchema(db) {
  await db.query(`
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
}

async function upsertChatMessage(db, message) {
  await db.query(
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
      ON CONFLICT (id) DO UPDATE
      SET
        from_username = EXCLUDED.from_username,
        to_username = EXCLUDED.to_username,
        message = EXCLUDED.message,
        image_attachment = EXCLUDED.image_attachment,
        created_at = EXCLUDED.created_at,
        edited_at = EXCLUDED.edited_at,
        updated_at = now()
    `,
    [
      message.id,
      message.fromUsername,
      message.toUsername,
      message.message,
      message.imageAttachment ? JSON.stringify(message.imageAttachment) : null,
      message.createdAt,
      message.editedAt ?? null,
    ],
  );
}

function isChatMessage(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    typeof value.fromUsername === "string" &&
    typeof value.toUsername === "string" &&
    typeof value.message === "string" &&
    (typeof value.imageAttachment === "undefined" ||
      isChatMediaAttachment(value.imageAttachment)) &&
    typeof value.createdAt === "string" &&
    (typeof value.editedAt === "undefined" || typeof value.editedAt === "string")
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

async function loadEnvFile(fileName) {
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
      const value = trimmedLine.slice(equalsIndex + 1).trim();

      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}
