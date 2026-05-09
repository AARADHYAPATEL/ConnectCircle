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
const adminUsersFile = path.join(dataDirectory, "admin-users.json");
const adminLoginAttemptsFile = path.join(
  dataDirectory,
  "admin-login-attempts.json",
);
const adminMaxFailedLoginAttempts = 5;
const adminLoginWindowMs = 15 * 60 * 1000;
const adminLoginLockMs = 15 * 60 * 1000;

type AdminUser = {
  id: string;
  username: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
  updatedAt?: string;
  lastLoginAt?: string;
};

export type PublicAdminUser = {
  id: string;
  username: string;
  createdAt: string;
  lastLoginAt?: string;
};

type AdminLoginAttempt = {
  usernameKey: string;
  failedAttempts: number;
  firstFailedAt: string;
  lockedUntil?: string;
};

type VerifyAdminResult = {
  admin: PublicAdminUser | null;
  error: string;
  status: number;
};

function toPublicAdminUser(admin: AdminUser): PublicAdminUser {
  return {
    id: admin.id,
    username: admin.username,
    createdAt: admin.createdAt,
    ...(admin.lastLoginAt ? { lastLoginAt: admin.lastLoginAt } : {}),
  };
}

function normalizeUsername(username: string) {
  return username.trim();
}

function normalizeUsernameKey(username: string) {
  return normalizeUsername(username).toLowerCase();
}

function getConfiguredAdminCredentials() {
  return {
    username: process.env.CONNECTCIRCLE_ADMIN_USERNAME?.trim() ?? "",
    password: process.env.CONNECTCIRCLE_ADMIN_PASSWORD ?? "",
  };
}

async function hashPassword(password: string, salt: string) {
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;

  return derivedKey.toString("hex");
}

async function readAdminUsers() {
  try {
    const file = await fs.readFile(adminUsersFile, "utf8");
    const parsed: unknown = JSON.parse(file);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isAdminUser);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function writeAdminUsers(admins: AdminUser[]) {
  await fs.mkdir(dataDirectory, { recursive: true });

  const temporaryFile = `${adminUsersFile}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(admins, null, 2), "utf8");
  await fs.rename(temporaryFile, adminUsersFile);
}

async function readAdminLoginAttempts() {
  try {
    const file = await fs.readFile(adminLoginAttemptsFile, "utf8");
    const parsed: unknown = JSON.parse(file);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isAdminLoginAttempt);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function writeAdminLoginAttempts(attempts: AdminLoginAttempt[]) {
  await fs.mkdir(dataDirectory, { recursive: true });

  const temporaryFile = `${adminLoginAttemptsFile}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(attempts, null, 2), "utf8");
  await fs.rename(temporaryFile, adminLoginAttemptsFile);
}

function validateConfiguredAdmin(username: string, password: string) {
  if (username.length < 3 || username.length > 48) {
    return "Admin username must be between 3 and 48 characters.";
  }

  if (!/^[a-zA-Z0-9_.-]+$/u.test(username)) {
    return "Admin username can only use letters, numbers, dots, dashes, and underscores.";
  }

  if (password.length < 12) {
    return "Admin password must be at least 12 characters.";
  }

  return "";
}

async function ensureConfiguredAdminUser() {
  const existingAdmins = await readAdminUsers();

  if (existingAdmins.length > 0) {
    return {
      admins: existingAdmins,
      error: "",
    };
  }

  const configuredAdmin = getConfiguredAdminCredentials();

  if (!configuredAdmin.username || !configuredAdmin.password) {
    return {
      admins: [],
      error:
        "Admin credentials are not configured. Set CONNECTCIRCLE_ADMIN_USERNAME and CONNECTCIRCLE_ADMIN_PASSWORD.",
    };
  }

  const validationError = validateConfiguredAdmin(
    configuredAdmin.username,
    configuredAdmin.password,
  );

  if (validationError) {
    return {
      admins: [],
      error: validationError,
    };
  }

  const passwordSalt = randomBytes(16).toString("hex");
  const passwordHash = await hashPassword(
    configuredAdmin.password,
    passwordSalt,
  );
  const now = new Date().toISOString();
  const admin: AdminUser = {
    id: randomUUID(),
    username: configuredAdmin.username,
    passwordHash,
    passwordSalt,
    createdAt: now,
    updatedAt: now,
  };

  await writeAdminUsers([admin]);

  return {
    admins: [admin],
    error: "",
  };
}

function getActiveAttempt(
  attempts: AdminLoginAttempt[],
  usernameKey: string,
) {
  const now = Date.now();
  const attempt = attempts.find(
    (currentAttempt) => currentAttempt.usernameKey === usernameKey,
  );

  if (!attempt) {
    return null;
  }

  if (attempt.lockedUntil && new Date(attempt.lockedUntil).getTime() > now) {
    return attempt;
  }

  if (now - new Date(attempt.firstFailedAt).getTime() > adminLoginWindowMs) {
    return null;
  }

  return attempt;
}

async function recordAdminLoginFailure(usernameKey: string) {
  const attempts = await readAdminLoginAttempts();
  const now = new Date();
  const activeAttempt = getActiveAttempt(attempts, usernameKey);
  const nextFailedAttempts = (activeAttempt?.failedAttempts ?? 0) + 1;
  const nextAttempt: AdminLoginAttempt = {
    usernameKey,
    failedAttempts: nextFailedAttempts,
    firstFailedAt: activeAttempt?.firstFailedAt ?? now.toISOString(),
    ...(nextFailedAttempts >= adminMaxFailedLoginAttempts
      ? {
          lockedUntil: new Date(now.getTime() + adminLoginLockMs).toISOString(),
        }
      : {}),
  };

  await writeAdminLoginAttempts([
    nextAttempt,
    ...attempts.filter((attempt) => attempt.usernameKey !== usernameKey),
  ]);
}

async function clearAdminLoginFailures(usernameKey: string) {
  const attempts = await readAdminLoginAttempts();

  await writeAdminLoginAttempts(
    attempts.filter((attempt) => attempt.usernameKey !== usernameKey),
  );
}

function getLoginLockedError(attempt: AdminLoginAttempt | null) {
  if (!attempt?.lockedUntil) {
    return "";
  }

  const lockedUntilMs = new Date(attempt.lockedUntil).getTime();

  if (lockedUntilMs <= Date.now()) {
    return "";
  }

  const minutesRemaining = Math.max(
    1,
    Math.ceil((lockedUntilMs - Date.now()) / 60000),
  );

  return `Too many failed admin login attempts. Try again in ${minutesRemaining} minute${minutesRemaining === 1 ? "" : "s"}.`;
}

export async function verifyAdminCredentials(
  username: string,
  password: string,
): Promise<VerifyAdminResult> {
  const cleanUsername = normalizeUsername(username);
  const usernameKey = normalizeUsernameKey(cleanUsername);

  if (!cleanUsername || !password) {
    return {
      admin: null,
      error: "Enter the admin username and password.",
      status: 400,
    };
  }

  const attempts = await readAdminLoginAttempts();
  const lockedError = getLoginLockedError(getActiveAttempt(attempts, usernameKey));

  if (lockedError) {
    return {
      admin: null,
      error: lockedError,
      status: 429,
    };
  }

  const configuredAdmin = await ensureConfiguredAdminUser();

  if (configuredAdmin.error) {
    return {
      admin: null,
      error: configuredAdmin.error,
      status: 503,
    };
  }

  const admin = configuredAdmin.admins.find(
    (currentAdmin) => normalizeUsernameKey(currentAdmin.username) === usernameKey,
  );
  const genericError = "Admin username or password is incorrect.";

  if (!admin) {
    await recordAdminLoginFailure(usernameKey);

    return {
      admin: null,
      error: genericError,
      status: 401,
    };
  }

  const attemptedHash = await hashPassword(password, admin.passwordSalt);
  const savedHash = Buffer.from(admin.passwordHash, "hex");
  const attemptedHashBuffer = Buffer.from(attemptedHash, "hex");

  if (
    savedHash.length !== attemptedHashBuffer.length ||
    !timingSafeEqual(savedHash, attemptedHashBuffer)
  ) {
    await recordAdminLoginFailure(usernameKey);

    return {
      admin: null,
      error: genericError,
      status: 401,
    };
  }

  await clearAdminLoginFailures(usernameKey);

  const updatedAdmin: AdminUser = {
    ...admin,
    lastLoginAt: new Date().toISOString(),
  };

  await writeAdminUsers(
    configuredAdmin.admins.map((currentAdmin) =>
      currentAdmin.id === updatedAdmin.id ? updatedAdmin : currentAdmin,
    ),
  );

  return {
    admin: toPublicAdminUser(updatedAdmin),
    error: "",
    status: 200,
  };
}

export async function getAdminById(adminId: string) {
  const admins = await readAdminUsers();
  const admin = admins.find((currentAdmin) => currentAdmin.id === adminId);

  return admin ? toPublicAdminUser(admin) : null;
}

function isAdminUser(value: unknown): value is AdminUser {
  if (!value || typeof value !== "object") {
    return false;
  }

  const admin = value as Partial<AdminUser>;

  return (
    typeof admin.id === "string" &&
    typeof admin.username === "string" &&
    typeof admin.passwordHash === "string" &&
    typeof admin.passwordSalt === "string" &&
    typeof admin.createdAt === "string"
  );
}

function isAdminLoginAttempt(value: unknown): value is AdminLoginAttempt {
  if (!value || typeof value !== "object") {
    return false;
  }

  const attempt = value as Partial<AdminLoginAttempt>;

  return (
    typeof attempt.usernameKey === "string" &&
    typeof attempt.failedAttempts === "number" &&
    typeof attempt.firstFailedAt === "string" &&
    (attempt.lockedUntil === undefined ||
      typeof attempt.lockedUntil === "string")
  );
}

