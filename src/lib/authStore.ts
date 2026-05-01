import { promises as fs } from "node:fs";
import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const dataDirectory = path.join(process.cwd(), ".data");
const usersFile = path.join(dataDirectory, "users.json");

export type UserAccount = {
  id: string;
  username: string;
  email: string;
  passwordHash?: string;
  passwordSalt?: string;
  googleSub?: string;
  authProviders?: Array<"password" | "google">;
  createdAt: string;
};

export type PublicUser = {
  id: string;
  username: string;
  email: string;
};

type CreateUserInput = {
  username: string;
  email: string;
  password: string;
};

type GoogleUserInput = {
  email: string;
  name: string;
  sub: string;
};

function toPublicUser(user: UserAccount): PublicUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
  };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeUsername(username: string) {
  return username.trim();
}

function slugifyUsername(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return slug || "connect_user";
}

async function hashPassword(password: string, salt: string) {
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;

  return derivedKey.toString("hex");
}

async function readUsers() {
  try {
    const file = await fs.readFile(usersFile, "utf8");
    const parsed: unknown = JSON.parse(file);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isUserAccount);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function writeUsers(users: UserAccount[]) {
  await fs.mkdir(dataDirectory, { recursive: true });

  const temporaryFile = `${usersFile}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(users, null, 2), "utf8");
  await fs.rename(temporaryFile, usersFile);
}

export async function createUser({ username, email, password }: CreateUserInput) {
  const cleanUsername = normalizeUsername(username);
  const cleanEmail = normalizeEmail(email);

  if (cleanUsername.length < 3 || cleanUsername.length > 24) {
    return {
      error: "Username must be between 3 and 24 characters.",
      user: null,
    };
  }

  if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
    return {
      error: "Username can only use letters, numbers, and underscores.",
      user: null,
    };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return {
      error: "Enter a valid email address.",
      user: null,
    };
  }

  if (password.length < 8) {
    return {
      error: "Password must be at least 8 characters.",
      user: null,
    };
  }

  const users = await readUsers();

  if (users.some((user) => user.email === cleanEmail)) {
    return {
      error: "An account with this email already exists.",
      user: null,
    };
  }

  if (
    users.some(
      (user) => user.username.toLowerCase() === cleanUsername.toLowerCase(),
    )
  ) {
    return {
      error: "This username is already taken.",
      user: null,
    };
  }

  const passwordSalt = randomBytes(16).toString("hex");
  const passwordHash = await hashPassword(password, passwordSalt);
  const user: UserAccount = {
    id: randomUUID(),
    username: cleanUsername,
    email: cleanEmail,
    passwordHash,
    passwordSalt,
    authProviders: ["password"],
    createdAt: new Date().toISOString(),
  };

  await writeUsers([...users, user]);

  return {
    error: "",
    user: toPublicUser(user),
  };
}

export async function verifyUser(email: string, password: string) {
  const cleanEmail = normalizeEmail(email);
  const users = await readUsers();
  const user = users.find((currentUser) => currentUser.email === cleanEmail);

  if (!user?.passwordHash || !user.passwordSalt) {
    return null;
  }

  const attemptedHash = await hashPassword(password, user.passwordSalt);
  const savedHash = Buffer.from(user.passwordHash, "hex");
  const attemptedHashBuffer = Buffer.from(attemptedHash, "hex");

  if (
    savedHash.length !== attemptedHashBuffer.length ||
    !timingSafeEqual(savedHash, attemptedHashBuffer)
  ) {
    return null;
  }

  return toPublicUser(user);
}

export async function findOrCreateGoogleUser({ email, name, sub }: GoogleUserInput) {
  const cleanEmail = normalizeEmail(email);
  const users = await readUsers();
  const existingGoogleUser = users.find((user) => user.googleSub === sub);

  if (existingGoogleUser) {
    return toPublicUser(existingGoogleUser);
  }

  const existingEmailUser = users.find((user) => user.email === cleanEmail);

  if (existingEmailUser) {
    const linkedUser: UserAccount = {
      ...existingEmailUser,
      googleSub: sub,
      authProviders: Array.from(
        new Set([...(existingEmailUser.authProviders ?? ["password"]), "google"]),
      ),
    };
    const nextUsers = users.map((user) =>
      user.id === linkedUser.id ? linkedUser : user,
    );

    await writeUsers(nextUsers);

    return toPublicUser(linkedUser);
  }

  const username = createUniqueUsername(name || cleanEmail.split("@")[0], users);
  const user: UserAccount = {
    id: randomUUID(),
    username,
    email: cleanEmail,
    googleSub: sub,
    authProviders: ["google"],
    createdAt: new Date().toISOString(),
  };

  await writeUsers([...users, user]);

  return toPublicUser(user);
}

export async function getUserById(userId: string) {
  const users = await readUsers();
  const user = users.find((currentUser) => currentUser.id === userId);

  return user ? toPublicUser(user) : null;
}

export async function getUserByUsername(username: string) {
  const cleanUsername = normalizeUsername(username).toLowerCase();
  const users = await readUsers();
  const user = users.find(
    (currentUser) => currentUser.username.toLowerCase() === cleanUsername,
  );

  return user ? toPublicUser(user) : null;
}

function isUserAccount(value: unknown): value is UserAccount {
  if (!value || typeof value !== "object") {
    return false;
  }

  const user = value as Partial<UserAccount>;

  return (
    typeof user.id === "string" &&
    typeof user.username === "string" &&
    typeof user.email === "string" &&
    typeof user.createdAt === "string"
  );
}

function createUniqueUsername(value: string, users: UserAccount[]) {
  const baseUsername = slugifyUsername(value).slice(0, 20);
  const usedUsernames = new Set(users.map((user) => user.username.toLowerCase()));

  if (!usedUsernames.has(baseUsername)) {
    return baseUsername;
  }

  for (let count = 2; count < 1000; count += 1) {
    const suffix = `_${count}`;
    const candidate = `${baseUsername.slice(0, 24 - suffix.length)}${suffix}`;

    if (!usedUsernames.has(candidate)) {
      return candidate;
    }
  }

  return `user_${randomUUID().slice(0, 8)}`;
}
