import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  BlockedConnection,
  ConnectionRelationshipSummary,
  ConnectionRequest,
  ConnectionSummary,
  Friendship,
} from "@/lib/connectionTypes";

const dataDirectory = path.join(process.cwd(), ".data");
const connectionsFile = path.join(dataDirectory, "connections.json");

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

async function readConnectionData(): Promise<ConnectionData> {
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
      .filter((block) => areSameUser(block.blockerUsername, normalizedUsername))
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
    typeof block.createdAt === "string"
  );
}
