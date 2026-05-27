import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Pool } = pg;
const requestsTable = "connectcircle_connection_requests";
const friendshipsTable = "connectcircle_friendships";
const blocksTable = "connectcircle_connection_blocks";

await loadEnvFile(".env.local");

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  "";

if (!connectionString) {
  console.error(
    "Missing DATABASE_URL or POSTGRES_URL. Add your Postgres connection string before migrating connections.",
  );
  process.exit(1);
}

const connectionsFile =
  process.argv[2] || path.join(process.cwd(), ".data", "connections.json");
const data = await readConnections(connectionsFile);
const pool = new Pool({
  connectionString: normalizePostgresSslMode(connectionString),
  max: 1,
});

try {
  await ensureSchema(pool);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const request of data.requests) {
      await upsertRequest(client, request);
    }

    for (const friendship of data.friendships) {
      await upsertFriendship(client, normalizeFriendship(friendship));
    }

    for (const block of data.blocks) {
      await upsertBlock(client, block);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  console.log(
    `Migrated ${data.requests.length} request(s), ${data.friendships.length} friendship(s), and ${data.blocks.length} block(s) to Postgres.`,
  );
} finally {
  await pool.end();
}

async function readConnections(filePath) {
  const file = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(file);

  if (!parsed || typeof parsed !== "object") {
    throw new Error(`${filePath} must contain a connection object.`);
  }

  return {
    requests: Array.isArray(parsed.requests)
      ? parsed.requests.filter(isConnectionRequest)
      : [],
    friendships: Array.isArray(parsed.friendships)
      ? parsed.friendships.filter(isFriendship)
      : [],
    blocks: Array.isArray(parsed.blocks)
      ? parsed.blocks.filter(isBlockedConnection)
      : [],
  };
}

function normalizeFriendship(friendship) {
  return {
    ...friendship,
    usernames: sortUsernames(friendship.usernames[0], friendship.usernames[1]),
  };
}

function sortUsernames(firstUsername, secondUsername) {
  return [firstUsername, secondUsername].sort((first, second) =>
    first.localeCompare(second),
  );
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
    CREATE TABLE IF NOT EXISTS ${requestsTable} (
      id text PRIMARY KEY,
      from_username text NOT NULL,
      to_username text NOT NULL,
      status text NOT NULL CHECK (status IN ('pending', 'accepted', 'declined')),
      created_at timestamptz NOT NULL,
      responded_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS ${friendshipsTable} (
      id text PRIMARY KEY,
      username_first text NOT NULL,
      username_second text NOT NULL,
      created_at timestamptz NOT NULL,
      request_id text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (username_first, username_second)
    );

    CREATE TABLE IF NOT EXISTS ${blocksTable} (
      id text PRIMARY KEY,
      blocker_username text NOT NULL,
      blocked_username text NOT NULL,
      created_at timestamptz NOT NULL,
      removed_from_list_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS connectcircle_connection_requests_users_idx
      ON ${requestsTable} (from_username, to_username, status);

    CREATE INDEX IF NOT EXISTS connectcircle_friendships_users_idx
      ON ${friendshipsTable} (username_first, username_second);

    CREATE INDEX IF NOT EXISTS connectcircle_connection_blocks_users_idx
      ON ${blocksTable} (blocker_username, blocked_username);
  `);
}

async function upsertRequest(db, request) {
  await db.query(
    `
      INSERT INTO ${requestsTable} (
        id,
        from_username,
        to_username,
        status,
        created_at,
        responded_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE
      SET
        from_username = EXCLUDED.from_username,
        to_username = EXCLUDED.to_username,
        status = EXCLUDED.status,
        created_at = EXCLUDED.created_at,
        responded_at = EXCLUDED.responded_at,
        updated_at = now()
    `,
    [
      request.id,
      request.fromUsername,
      request.toUsername,
      request.status,
      request.createdAt,
      request.respondedAt ?? null,
    ],
  );
}

async function upsertFriendship(db, friendship) {
  const existing = await db.query(
    `
      SELECT id
      FROM ${friendshipsTable}
      WHERE id = $1 OR (username_first = $2 AND username_second = $3)
      LIMIT 1
    `,
    [friendship.id, friendship.usernames[0], friendship.usernames[1]],
  );
  const friendshipId = existing.rows[0]?.id ?? friendship.id;

  await db.query(
    `
      INSERT INTO ${friendshipsTable} (
        id,
        username_first,
        username_second,
        created_at,
        request_id
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE
      SET
        username_first = EXCLUDED.username_first,
        username_second = EXCLUDED.username_second,
        created_at = EXCLUDED.created_at,
        request_id = EXCLUDED.request_id,
        updated_at = now()
    `,
    [
      friendshipId,
      friendship.usernames[0],
      friendship.usernames[1],
      friendship.createdAt,
      friendship.requestId,
    ],
  );
}

async function upsertBlock(db, block) {
  await db.query(
    `
      INSERT INTO ${blocksTable} (
        id,
        blocker_username,
        blocked_username,
        created_at,
        removed_from_list_at
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE
      SET
        blocker_username = EXCLUDED.blocker_username,
        blocked_username = EXCLUDED.blocked_username,
        created_at = EXCLUDED.created_at,
        removed_from_list_at = EXCLUDED.removed_from_list_at,
        updated_at = now()
    `,
    [
      block.id,
      block.blockerUsername,
      block.blockedUsername,
      block.createdAt,
      block.removedFromListAt ?? null,
    ],
  );
}

function isConnectionRequest(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    typeof value.fromUsername === "string" &&
    typeof value.toUsername === "string" &&
    ["pending", "accepted", "declined"].includes(value.status) &&
    typeof value.createdAt === "string"
  );
}

function isFriendship(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    Array.isArray(value.usernames) &&
    value.usernames.length === 2 &&
    typeof value.usernames[0] === "string" &&
    typeof value.usernames[1] === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.requestId === "string"
  );
}

function isBlockedConnection(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    typeof value.blockerUsername === "string" &&
    typeof value.blockedUsername === "string" &&
    typeof value.createdAt === "string" &&
    (typeof value.removedFromListAt === "undefined" ||
      typeof value.removedFromListAt === "string")
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
