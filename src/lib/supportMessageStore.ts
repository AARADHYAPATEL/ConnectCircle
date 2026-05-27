import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getFriendUsernames } from "@/lib/connectionStore";
import {
  readTursoJsonDocument,
  shouldUseTurso,
  writeTursoJsonDocument,
} from "@/lib/tursoStore";
import {
  isSupportMessage,
  supportMessageLimit,
  type SupportMessage,
  type SupportMessageSummary,
} from "@/lib/supportMessageTypes";

const dataDirectory = path.join(process.cwd(), ".data");
const supportMessagesFile = path.join(dataDirectory, "support-messages.json");
const tursoSupportMessagesDocumentKey = "support-messages";

type SendSupportMessageResult = {
  error: string;
  message: SupportMessage | null;
};

function areSameUser(firstUsername: string, secondUsername: string) {
  return firstUsername.trim().toLowerCase() === secondUsername.trim().toLowerCase();
}

async function readSupportMessages() {
  if (shouldUseTurso()) {
    return readTursoJsonDocument<SupportMessage[]>(
      tursoSupportMessagesDocumentKey,
      [],
      (value) => (Array.isArray(value) ? value.filter(isSupportMessage) : []),
    );
  }

  try {
    const file = await fs.readFile(supportMessagesFile, "utf8");
    const parsed: unknown = JSON.parse(file);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isSupportMessage);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function writeSupportMessages(messages: SupportMessage[]) {
  if (shouldUseTurso()) {
    await writeTursoJsonDocument(tursoSupportMessagesDocumentKey, messages);
    return;
  }

  await fs.mkdir(dataDirectory, { recursive: true });

  const temporaryFile = `${supportMessagesFile}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(messages, null, 2), "utf8");
  await fs.rename(temporaryFile, supportMessagesFile);
}

export async function getSupportMessageSummary(
  username: string,
): Promise<SupportMessageSummary> {
  const messages = await readSupportMessages();
  const sortedMessages = [...messages].sort(
    (first, second) =>
      new Date(second.createdAt).getTime() -
      new Date(first.createdAt).getTime(),
  );

  return {
    receivedMessages: sortedMessages.filter((message) =>
      areSameUser(message.toUsername, username),
    ),
    sentMessages: sortedMessages.filter((message) =>
      areSameUser(message.fromUsername, username),
    ),
  };
}

export async function sendSupportMessage(
  fromUsername: string,
  toUsername: string,
  message: string,
): Promise<SendSupportMessageResult> {
  const cleanMessage = message.trim();

  if (areSameUser(fromUsername, toUsername)) {
    return {
      error: "You cannot send a support message to yourself.",
      message: null,
    };
  }

  if (!cleanMessage) {
    return {
      error: "Support message is required.",
      message: null,
    };
  }

  if (cleanMessage.length > supportMessageLimit) {
    return {
      error: `Support message must be ${supportMessageLimit} characters or fewer.`,
      message: null,
    };
  }

  const friendUsernames = await getFriendUsernames(fromUsername);
  const targetFriendUsername = friendUsernames.find((friendUsername) =>
    areSameUser(friendUsername, toUsername),
  );

  if (!targetFriendUsername) {
    return {
      error: "You can only send supportive messages to accepted friends.",
      message: null,
    };
  }

  const supportMessage: SupportMessage = {
    id: randomUUID(),
    fromUsername,
    toUsername: targetFriendUsername,
    message: cleanMessage,
    createdAt: new Date().toISOString(),
  };
  const messages = await readSupportMessages();

  await writeSupportMessages([supportMessage, ...messages]);

  return {
    error: "",
    message: supportMessage,
  };
}
