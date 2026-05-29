import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Pool, type QueryResultRow } from "pg";
import {
  readTursoJsonDocument,
  shouldUseTurso,
  writeTursoJsonDocument,
} from "@/lib/tursoStore";
import type {
  BlockedConnection,
  ConnectionRelationshipSummary,
  ConnectionRequest,
  ConnectionSummary,
  Friendship,
} from "@/lib/connectionTypes";

const dataDirectory = path.join(process.cwd(), ".data");
const connectionsFile = path.join(dataDirectory, "connections.json");
const requestsTable = "connectcircle_connection_requests";
const friendshipsTable = "connectcircle_friendships";
const blocksTable = "connectcircle_connection_blocks";
const tursoConnectionsDocumentKey = "connections";

let pool: Pool | null = null;
let hasEnsuredPostgresSchema = false;

type ConnectionData = {
  requests: ConnectionRequest[];
  friendships: Friendship[];
  blocks: BlockedConnection[];
};

type StoredConnectionData = {
  requests: unknown[];
  friendships: unknown[];
  blocks?: unknown[];
};

type SendRequestResult = {
  error: string;
  request: ConnectionRequest | null;
};

type RespondRequestResult = {
  error: string;
  request: ConnectionRequest | null;
  friendship: Friendship | null;
};

type ConnectionMutationResult = {
  error: string;
};

type ConnectionRequestRow = QueryResultRow & {
  id: string;
  from_username: string;
  to_username: string;
  status: string;
  created_at: Date | string;
  responded_at: Date | string | null;
};

type FriendshipRow = QueryResultRow & {
  id: string;
  username_first: string;
  username_second: string;
  created_at: Date | string;
  request_id: string;
};

type BlockedConnectionRow = QueryResultRow & {
  id: string;
  blocker_username: string;
  blocked_username: string;
  created_at: Date | string;
  removed_from_list_at: Date | string | null;
};

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function sortUsernames(firstUsername: string, secondUsername: string) {
  return [firstUsername, secondUsername].sort((first, second) =>
    first.localeCompare(second),
  ) as [string, string];
}

function areSameUser(firstUsername: string, secondUsername: string) {
  return normalizeUsername(firstUsername) === normalizeUsername(secondUsername);
}

function isBetweenUsers(
  request: ConnectionRequest,
  firstUsername: string,
  secondUsername: string,
) {
  return (
    (areSameUser(request.fromUsername, firstUsername) &&
      areSameUser(request.toUsername, secondUsername)) ||
    (areSameUser(request.fromUsername, secondUsername) &&
      areSameUser(request.toUsername, firstUsername))
  );
}

function hasFriendship(
  friendship: Friendship,
  firstUsername: string,
  secondUsername: string,
) {
  const sortedUsernames = sortUsernames(
    normalizeUsername(firstUsername),
    normalizeUsername(secondUsername),
  );

  return (
    friendship.usernames[0].toLowerCase() === sortedUsernames[0] &&
    friendship.usernames[1].toLowerCase() === sortedUsernames[1]
  );
}

function getOtherFriendUsername(friendship: Friendship, username: string) {
  return (
    friendship.usernames.find(
      (friendUsername) =>
        friendUsername.toLowerCase() !== normalizeUsername(username),
    ) ?? friendship.usernames[0]
  );
}

function isBlockedBy(
  blocks: BlockedConnection[],
  blockerUsername: string,
  blockedUsername: string,
) {
  return blocks.some(
    (block) =>
      areSameUser(block.blockerUsername, blockerUsername) &&
      areSameUser(block.blockedUsername, blockedUsername),
  );
}

function isBlockedBetween(
  blocks: BlockedConnection[],
  firstUsername: string,
  secondUsername: string,
) {
  return (
    isBlockedBy(blocks, firstUsername, secondUsername) ||
    isBlockedBy(blocks, secondUsername, firstUsername)
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

function assertProductionConnectionStoreConfigured() {
  if (
    !shouldUseTurso() &&
    !shouldUsePostgres() &&
    (process.env.VERCEL === "1" ||
      process.env.CONNECTCIRCLE_REQUIRE_DATABASE === "true")
  ) {
    throw new Error(
      "ConnectCircle connection storage is not configured. Set TURSO_DATABASE_URL, DATABASE_URL, or POSTGRES_URL before running in production.",
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

  hasEnsuredPostgresSchema = true;
}

async function readPostgresConnectionData(): Promise<ConnectionData> {
  await ensurePostgresSchema();

  const [requestRows, friendshipRows, blockRows] = await Promise.all([
    getPool().query<ConnectionRequestRow>(`
      SELECT id, from_username, to_username, status, created_at, responded_at
      FROM ${requestsTable}
      ORDER BY created_at DESC
    `),
    getPool().query<FriendshipRow>(`
      SELECT id, username_first, username_second, created_at, request_id
      FROM ${friendshipsTable}
      ORDER BY created_at DESC
    `),
    getPool().query<BlockedConnectionRow>(`
      SELECT id, blocker_username, blocked_username, created_at, removed_from_list_at
      FROM ${blocksTable}
      ORDER BY created_at DESC
    `),
  ]);

  return {
    requests: requestRows.rows.map(toConnectionRequest),
    friendships: friendshipRows.rows.map(toFriendship),
    blocks: blockRows.rows.map(toBlockedConnection),
  };
}

function validateConnectionDocument(value: unknown): ConnectionData {
  if (!isConnectionData(value)) {
    return { requests: [], friendships: [], blocks: [] };
  }

  return {
    requests: value.requests.filter(isConnectionRequest),
    friendships: value.friendships.filter(isFriendship),
    blocks: Array.isArray(value.blocks)
      ? value.blocks.filter(isBlockedConnection)
      : [],
  };
}

async function readTursoConnectionData() {
  return readTursoJsonDocument<ConnectionData>(
    tursoConnectionsDocumentKey,
    { requests: [], friendships: [], blocks: [] },
    validateConnectionDocument,
  );
}

async function writeTursoConnectionData(data: ConnectionData) {
  await writeTursoJsonDocument(tursoConnectionsDocumentKey, data);
}

async function writePostgresConnectionData(data: ConnectionData) {
  await ensurePostgresSchema();

  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM ${blocksTable}`);
    await client.query(`DELETE FROM ${friendshipsTable}`);
    await client.query(`DELETE FROM ${requestsTable}`);

    for (const request of data.requests) {
      await client.query(
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

    for (const friendship of data.friendships) {
      await client.query(
        `
          INSERT INTO ${friendshipsTable} (
            id,
            username_first,
            username_second,
            created_at,
            request_id
          )
          VALUES ($1, $2, $3, $4, $5)
        `,
        [
          friendship.id,
          friendship.usernames[0],
          friendship.usernames[1],
          friendship.createdAt,
          friendship.requestId,
        ],
      );
    }

    for (const block of data.blocks) {
      await client.query(
        `
          INSERT INTO ${blocksTable} (
            id,
            blocker_username,
            blocked_username,
            created_at,
            removed_from_list_at
          )
          VALUES ($1, $2, $3, $4, $5)
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

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function readConnectionData(): Promise<ConnectionData> {
  if (shouldUseTurso()) {
    return readTursoConnectionData();
  }

  if (shouldUsePostgres()) {
    return readPostgresConnectionData();
  }

  assertProductionConnectionStoreConfigured();

  try {
    const file = await fs.readFile(connectionsFile, "utf8");
    const parsed: unknown = JSON.parse(file);

    if (!isConnectionData(parsed)) {
      return { requests: [], friendships: [], blocks: [] };
    }

    return {
      requests: parsed.requests.filter(isConnectionRequest),
      friendships: parsed.friendships.filter(isFriendship),
      blocks: Array.isArray(parsed.blocks)
        ? parsed.blocks.filter(isBlockedConnection)
        : [],
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { requests: [], friendships: [], blocks: [] };
    }

    throw error;
  }
}

async function writeConnectionData(data: ConnectionData) {
  if (shouldUseTurso()) {
    await writeTursoConnectionData(data);
    return;
  }

  if (shouldUsePostgres()) {
    await writePostgresConnectionData(data);
    return;
  }

  assertProductionConnectionStoreConfigured();

  await fs.mkdir(dataDirectory, { recursive: true });

  const temporaryFile = `${connectionsFile}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(temporaryFile, connectionsFile);
}

export async function getConnectionSummary(
  username: string,
): Promise<ConnectionSummary> {
  const data = await readConnectionData();
  const normalizedUsername = normalizeUsername(username);
  const pendingRequests = data.requests.filter(
    (request) =>
      request.status === "pending" &&
      !isBlockedBetween(data.blocks, request.fromUsername, request.toUsername),
  );

  return {
    incomingRequests: pendingRequests.filter((request) =>
      areSameUser(request.toUsername, normalizedUsername),
    ),
    outgoingRequests: pendingRequests.filter((request) =>
      areSameUser(request.fromUsername, normalizedUsername),
    ),
    friends: data.friendships
      .filter(
        (friendship) =>
          friendship.usernames.some(
            (friendUsername) =>
              friendUsername.toLowerCase() === normalizedUsername,
          ) &&
          !isBlockedBetween(
            data.blocks,
            friendship.usernames[0],
            friendship.usernames[1],
          ),
      )
      .sort(
        (first, second) =>
          new Date(second.createdAt).getTime() -
          new Date(first.createdAt).getTime(),
    ),
    blockedUsers: data.blocks
      .filter(
        (block) =>
          areSameUser(block.blockerUsername, normalizedUsername) &&
          !block.removedFromListAt,
      )
      .sort(
        (first, second) =>
          new Date(second.createdAt).getTime() -
          new Date(first.createdAt).getTime(),
      ),
  };
}

export async function getFriendUsernames(username: string) {
  const data = await readConnectionData();
  const normalizedUsername = normalizeUsername(username);

  return data.friendships
    .filter(
      (friendship) =>
        friendship.usernames.some(
          (friendUsername) =>
            friendUsername.toLowerCase() === normalizedUsername,
        ) &&
        !isBlockedBetween(
          data.blocks,
          friendship.usernames[0],
          friendship.usernames[1],
        ),
    )
    .map((friendship) => getOtherFriendUsername(friendship, username))
    .sort((first, second) => first.localeCompare(second));
}

export async function getConnectionRelationship(
  viewerUsername: string,
  profileUsername: string,
): Promise<ConnectionRelationshipSummary> {
  const data = await readConnectionData();
  const friendship =
    data.friendships.find((currentFriendship) =>
      hasFriendship(currentFriendship, viewerUsername, profileUsername),
    ) ?? null;

  if (isBlockedBetween(data.blocks, viewerUsername, profileUsername)) {
    return {
      friendship: null,
      relationship: "blocked",
    };
  }

  if (friendship) {
    return {
      friendship,
      relationship: "connected",
    };
  }

  const pendingRequest = data.requests.find(
    (request) =>
      request.status === "pending" &&
      isBetweenUsers(request, viewerUsername, profileUsername),
  );

  if (pendingRequest) {
    return {
      friendship: null,
      relationship: areSameUser(pendingRequest.fromUsername, viewerUsername)
        ? "outgoing_request"
        : "incoming_request",
    };
  }

  return {
    friendship: null,
    relationship: "none",
  };
}

export async function sendConnectionRequest(
  fromUsername: string,
  toUsername: string,
): Promise<SendRequestResult> {
  if (areSameUser(fromUsername, toUsername)) {
    return {
      error: "You cannot send a connection request to yourself.",
      request: null,
    };
  }

  const data = await readConnectionData();

  if (isBlockedBy(data.blocks, fromUsername, toUsername)) {
    return {
      error: "Unblock this user before sending a connection request.",
      request: null,
    };
  }

  if (isBlockedBy(data.blocks, toUsername, fromUsername)) {
    return {
      error: "A connection request cannot be sent to this user.",
      request: null,
    };
  }

  if (
    data.friendships.some((friendship) =>
      hasFriendship(friendship, fromUsername, toUsername),
    )
  ) {
    return {
      error: "You are already connected with this user.",
      request: null,
    };
  }

  const pendingRequest = data.requests.find(
    (request) =>
      request.status === "pending" &&
      isBetweenUsers(request, fromUsername, toUsername),
  );

  if (pendingRequest) {
    if (areSameUser(pendingRequest.fromUsername, fromUsername)) {
      return {
        error: "You already sent this connection request.",
        request: pendingRequest,
      };
    }

    return {
      error: "This user already sent you a request. Accept it from your incoming requests.",
      request: pendingRequest,
    };
  }

  const request: ConnectionRequest = {
    id: randomUUID(),
    fromUsername,
    toUsername,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  await writeConnectionData({
    ...data,
    requests: [request, ...data.requests],
  });

  return {
    error: "",
    request,
  };
}

export async function respondToConnectionRequest(
  username: string,
  requestId: string,
  action: "accept" | "decline",
): Promise<RespondRequestResult> {
  const data = await readConnectionData();
  const request = data.requests.find(
    (currentRequest) => currentRequest.id === requestId,
  );

  if (!request) {
    return {
      error: "Connection request was not found.",
      request: null,
      friendship: null,
    };
  }

  if (!areSameUser(request.toUsername, username)) {
    return {
      error: "Only the requested user can respond to this connection request.",
      request: null,
      friendship: null,
    };
  }

  if (request.status !== "pending") {
    return {
      error: "This connection request has already been handled.",
      request,
      friendship: null,
    };
  }

  const respondedRequest: ConnectionRequest = {
    ...request,
    status: action === "accept" ? "accepted" : "declined",
    respondedAt: new Date().toISOString(),
  };
  const nextRequests = data.requests.map((currentRequest) =>
    currentRequest.id === respondedRequest.id
      ? respondedRequest
      : currentRequest,
  );

  if (action === "decline") {
    await writeConnectionData({
      ...data,
      requests: nextRequests,
    });

    return {
      error: "",
      request: respondedRequest,
      friendship: null,
    };
  }

  if (isBlockedBetween(data.blocks, request.fromUsername, request.toUsername)) {
    return {
      error: "This connection request cannot be accepted while a block is active.",
      request: null,
      friendship: null,
    };
  }

  const existingFriendship = data.friendships.find((friendship) =>
    hasFriendship(friendship, request.fromUsername, request.toUsername),
  );
  const friendship =
    existingFriendship ??
    ({
      id: randomUUID(),
      usernames: sortUsernames(request.fromUsername, request.toUsername),
      createdAt: new Date().toISOString(),
      requestId: request.id,
    } satisfies Friendship);

  await writeConnectionData({
    requests: nextRequests,
    friendships: existingFriendship
      ? data.friendships
      : [friendship, ...data.friendships],
    blocks: data.blocks,
  });

  return {
    error: "",
    request: respondedRequest,
    friendship,
  };
}

export async function cancelConnectionRequest(
  username: string,
  requestId: string,
): Promise<ConnectionMutationResult> {
  const data = await readConnectionData();
  const request = data.requests.find(
    (currentRequest) => currentRequest.id === requestId,
  );

  if (!request) {
    return {
      error: "Connection request was not found.",
    };
  }

  if (!areSameUser(request.fromUsername, username)) {
    return {
      error: "Only the sender can cancel this connection request.",
    };
  }

  if (request.status !== "pending") {
    return {
      error: "This connection request has already been handled.",
    };
  }

  await writeConnectionData({
    ...data,
    requests: data.requests.filter(
      (currentRequest) => currentRequest.id !== request.id,
    ),
  });

  return { error: "" };
}

export async function removeFriend(
  username: string,
  friendUsername: string,
): Promise<ConnectionMutationResult> {
  const data = await readConnectionData();
  const friendship = data.friendships.find((currentFriendship) =>
    hasFriendship(currentFriendship, username, friendUsername),
  );

  if (!friendship) {
    return {
      error: "This user is not in your friends list.",
    };
  }

  await writeConnectionData({
    ...data,
    friendships: data.friendships.filter(
      (currentFriendship) => currentFriendship.id !== friendship.id,
    ),
  });

  return { error: "" };
}

export async function blockFriend(
  username: string,
  friendUsername: string,
): Promise<ConnectionMutationResult> {
  if (areSameUser(username, friendUsername)) {
    return {
      error: "You cannot block yourself.",
    };
  }

  const data = await readConnectionData();
  const friendship = data.friendships.find((currentFriendship) =>
    hasFriendship(currentFriendship, username, friendUsername),
  );

  if (!friendship) {
    return {
      error: "You can only block accepted friends from this page.",
    };
  }

  if (isBlockedBy(data.blocks, username, friendUsername)) {
    return {
      error: "This user is already blocked.",
    };
  }

  const blockedUsername = getOtherFriendUsername(friendship, username);
  const block: BlockedConnection = {
    id: randomUUID(),
    blockerUsername: username,
    blockedUsername,
    createdAt: new Date().toISOString(),
  };

  await writeConnectionData({
    requests: data.requests.filter(
      (request) => !isBetweenUsers(request, username, blockedUsername),
    ),
    friendships: data.friendships.filter(
      (currentFriendship) => currentFriendship.id !== friendship.id,
    ),
    blocks: [block, ...data.blocks],
  });

  return { error: "" };
}

export async function unblockUser(
  username: string,
  blockedUsername: string,
): Promise<ConnectionMutationResult> {
  const data = await readConnectionData();
  const nextBlocks = data.blocks.filter(
    (block) =>
      !(
        areSameUser(block.blockerUsername, username) &&
        areSameUser(block.blockedUsername, blockedUsername)
      ),
  );

  if (nextBlocks.length === data.blocks.length) {
    return {
      error: "This user is not blocked.",
    };
  }

  await writeConnectionData({
    ...data,
    blocks: nextBlocks,
  });

  return { error: "" };
}

export async function removeBlockedUser(
  username: string,
  blockedUsername: string,
): Promise<ConnectionMutationResult> {
  const data = await readConnectionData();
  let didUpdateBlock = false;

  const nextBlocks = data.blocks.map((block) => {
    if (
      areSameUser(block.blockerUsername, username) &&
      areSameUser(block.blockedUsername, blockedUsername) &&
      !block.removedFromListAt
    ) {
      didUpdateBlock = true;

      return {
        ...block,
        removedFromListAt: new Date().toISOString(),
      };
    }

    return block;
  });

  if (!didUpdateBlock) {
    return {
      error: "This user is not in your blocked users list.",
    };
  }

  await writeConnectionData({
    ...data,
    blocks: nextBlocks,
  });

  return { error: "" };
}

function isConnectionData(value: unknown): value is StoredConnectionData {
  if (!value || typeof value !== "object") {
    return false;
  }

  const data = value as Partial<StoredConnectionData>;

  return Array.isArray(data.requests) && Array.isArray(data.friendships);
}

function isConnectionRequest(value: unknown): value is ConnectionRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const request = value as Partial<ConnectionRequest>;

  return (
    typeof request.id === "string" &&
    typeof request.fromUsername === "string" &&
    typeof request.toUsername === "string" &&
    (request.status === "pending" ||
      request.status === "accepted" ||
      request.status === "declined") &&
    typeof request.createdAt === "string"
  );
}

function isFriendship(value: unknown): value is Friendship {
  if (!value || typeof value !== "object") {
    return false;
  }

  const friendship = value as Partial<Friendship>;

  return (
    typeof friendship.id === "string" &&
    Array.isArray(friendship.usernames) &&
    friendship.usernames.length === 2 &&
    typeof friendship.usernames[0] === "string" &&
    typeof friendship.usernames[1] === "string" &&
    typeof friendship.createdAt === "string" &&
    typeof friendship.requestId === "string"
  );
}

function isBlockedConnection(value: unknown): value is BlockedConnection {
  if (!value || typeof value !== "object") {
    return false;
  }

  const block = value as Partial<BlockedConnection>;

  return (
    typeof block.id === "string" &&
    typeof block.blockerUsername === "string" &&
    typeof block.blockedUsername === "string" &&
    typeof block.createdAt === "string" &&
    (typeof block.removedFromListAt === "undefined" ||
      typeof block.removedFromListAt === "string")
  );
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

function toConnectionRequest(row: ConnectionRequestRow): ConnectionRequest {
  const respondedAt = row.responded_at
    ? toIsoString(row.responded_at)
    : undefined;

  return {
    id: row.id,
    fromUsername: row.from_username,
    toUsername: row.to_username,
    status: row.status as ConnectionRequest["status"],
    createdAt: toIsoString(row.created_at),
    ...(respondedAt ? { respondedAt } : {}),
  };
}

function toFriendship(row: FriendshipRow): Friendship {
  return {
    id: row.id,
    usernames: [row.username_first, row.username_second],
    createdAt: toIsoString(row.created_at),
    requestId: row.request_id,
  };
}

function toBlockedConnection(row: BlockedConnectionRow): BlockedConnection {
  const removedFromListAt = row.removed_from_list_at
    ? toIsoString(row.removed_from_list_at)
    : undefined;

  return {
    id: row.id,
    blockerUsername: row.blocker_username,
    blockedUsername: row.blocked_username,
    createdAt: toIsoString(row.created_at),
    ...(removedFromListAt ? { removedFromListAt } : {}),
  };
}
