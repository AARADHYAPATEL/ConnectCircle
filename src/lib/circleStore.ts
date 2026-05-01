import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getFriendUsernames } from "@/lib/connectionStore";
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

type CircleData = {
  circles: Circle[];
  joinRequests: CircleJoinRequest[];
  messages: CircleMessage[];
};

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

async function readCircleData(): Promise<CircleData> {
  try {
    const file = await fs.readFile(circlesFile, "utf8");
    const parsed: unknown = JSON.parse(file);

    if (!isCircleData(parsed)) {
      return { circles: [], joinRequests: [], messages: [] };
    }

    return {
      circles: parsed.circles.filter(isCircle),
      joinRequests: Array.isArray(parsed.joinRequests)
        ? parsed.joinRequests.filter(isCircleJoinRequest)
        : [],
      messages: Array.isArray(parsed.messages)
        ? parsed.messages.filter(isCircleMessage)
        : [],
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { circles: [], joinRequests: [], messages: [] };
    }

    throw error;
  }
}

async function writeCircleData(data: CircleData) {
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
  const data = await readCircleData();

  return sortCircles(
    data.circles.filter((circle) => isMember(circle, username)),
  );
}

export async function getCircleSummaryForUser(
  username: string,
): Promise<CircleSummary> {
  const [data, friendUsernames] = await Promise.all([
    readCircleData(),
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
  const data = await readCircleData();

  return (
    data.circles.find(
      (circle) => circle.id === circleId && isMember(circle, username),
    ) ?? null
  );
}

export async function getCircleChatThread(
  username: string,
  circleId: string,
): Promise<CircleThreadResult> {
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

export async function sendCircleMessage(
  fromUsername: string,
  circleId: string,
  message: string,
): Promise<SendCircleMessageResult> {
  const cleanMessage = message.trim();

  if (!cleanMessage) {
    return {
      error: "Message is required.",
      message: null,
    };
  }

  if (cleanMessage.length > circleMessageLimit) {
    return {
      error: `Message must be ${circleMessageLimit} characters or fewer.`,
      message: null,
    };
  }

  const data = await readCircleData();
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

  const circleMessage: CircleMessage = {
    id: randomUUID(),
    circleId: circle.id,
    fromUsername,
    message: cleanMessage,
    createdAt: new Date().toISOString(),
  };

  await writeCircleData({
    ...data,
    messages: [circleMessage, ...data.messages],
  });

  return {
    error: "",
    message: circleMessage,
  };
}

export async function editCircleMessage(
  username: string,
  messageId: string,
  message: string,
): Promise<CircleMessageMutationResult> {
  const cleanMessage = message.trim();

  if (!cleanMessage) {
    return {
      error: "Message is required.",
      message: null,
    };
  }

  if (cleanMessage.length > circleMessageLimit) {
    return {
      error: `Message must be ${circleMessageLimit} characters or fewer.`,
      message: null,
    };
  }

  const data = await readCircleData();
  const existingMessage = data.messages.find(
    (currentMessage) => currentMessage.id === messageId,
  );

  if (!existingMessage) {
    return {
      error: "Message was not found.",
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

  const updatedMessage: CircleMessage = {
    ...existingMessage,
    message: cleanMessage,
    editedAt: new Date().toISOString(),
  };

  await writeCircleData({
    ...data,
    messages: data.messages.map((currentMessage) =>
      currentMessage.id === messageId ? updatedMessage : currentMessage,
    ),
  });

  return {
    error: "",
    message: updatedMessage,
  };
}

export async function deleteCircleMessage(
  username: string,
  messageId: string,
): Promise<DeleteCircleMessageResult> {
  const data = await readCircleData();
  const existingMessage = data.messages.find(
    (currentMessage) => currentMessage.id === messageId,
  );

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

  await writeCircleData({
    ...data,
    messages: data.messages.filter(
      (currentMessage) => currentMessage.id !== messageId,
    ),
  });

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
