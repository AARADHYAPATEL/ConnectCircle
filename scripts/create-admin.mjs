import { createClient } from "@libsql/client";
import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
} from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";

const scrypt = promisify(scryptCallback);
const dataDirectory = path.join(process.cwd(), ".data");
const adminUsersFile = path.join(dataDirectory, "admin-users.json");
const adminLoginAttemptsFile = path.join(
  dataDirectory,
  "admin-login-attempts.json",
);
const documentsTable = "connectcircle_documents";
const adminUsersDocumentKey = "admin-users";
const adminLoginAttemptsDocumentKey = "admin-login-attempts";

await loadEnvFile(".env.local");
await loadEnvFile(".env.turso.local", { override: true });

const username = process.argv[2]?.trim() || process.env.CONNECTCIRCLE_NEW_ADMIN_USERNAME?.trim() || "";
const providedPassword = process.argv[3] || process.env.CONNECTCIRCLE_NEW_ADMIN_PASSWORD || "";
const password = providedPassword || generatePassword();
const validationError = validateAdmin(username, password);

if (validationError) {
  console.error(validationError);
  console.error("Usage: npm run admin:create -- admin_username optional_password");
  process.exit(1);
}

const now = new Date().toISOString();
const passwordSalt = randomBytes(16).toString("hex");
const admin = {
  createdAt: now,
  id: randomUUID(),
  passwordHash: await hashPassword(password, passwordSalt),
  passwordSalt,
  updatedAt: now,
  username,
};

const tursoUrl =
  process.env.TURSO_DATABASE_URL || process.env.LIBSQL_DATABASE_URL || "";

if (tursoUrl) {
  await createTursoAdmin(admin);
  console.log(`Created Turso admin: ${username}`);
} else {
  await createLocalAdmin(admin);
  console.log(`Created local admin: ${username}`);
}

if (!providedPassword) {
  console.log(`Generated password: ${password}`);
}

async function createTursoAdmin(nextAdmin) {
  const authToken =
    process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN || "";
  const client = createClient({
    url: tursoUrl,
    ...(authToken ? { authToken } : {}),
  });

  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS ${documentsTable} (
        document_key TEXT PRIMARY KEY,
        data_blob BLOB NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    const admins = await readTursoDocument(client, adminUsersDocumentKey, []);
    const cleanAdmins = Array.isArray(admins) ? admins.filter(isAdminUser) : [];

    if (cleanAdmins.some((admin) => sameUsername(admin.username, username))) {
      throw new Error(`Admin username "${username}" already exists.`);
    }

    await writeTursoDocument(client, adminUsersDocumentKey, [
      nextAdmin,
      ...cleanAdmins,
    ]);

    const attempts = await readTursoDocument(
      client,
      adminLoginAttemptsDocumentKey,
      [],
    );
    const cleanAttempts = Array.isArray(attempts)
      ? attempts.filter(isAdminLoginAttempt)
      : [];

    await writeTursoDocument(
      client,
      adminLoginAttemptsDocumentKey,
      cleanAttempts.filter((attempt) => !sameUsername(attempt.usernameKey, username)),
    );
  } finally {
    client.close();
  }
}

async function createLocalAdmin(nextAdmin) {
  const admins = await readLocalJson(adminUsersFile, []);
  const cleanAdmins = Array.isArray(admins) ? admins.filter(isAdminUser) : [];

  if (cleanAdmins.some((admin) => sameUsername(admin.username, username))) {
    throw new Error(`Admin username "${username}" already exists.`);
  }

  await writeLocalJson(adminUsersFile, [nextAdmin, ...cleanAdmins]);

  const attempts = await readLocalJson(adminLoginAttemptsFile, []);
  const cleanAttempts = Array.isArray(attempts)
    ? attempts.filter(isAdminLoginAttempt)
    : [];

  await writeLocalJson(
    adminLoginAttemptsFile,
    cleanAttempts.filter((attempt) => !sameUsername(attempt.usernameKey, username)),
  );
}

async function readTursoDocument(client, documentKey, fallback) {
  const result = await client.execute({
    sql: `SELECT data_blob FROM ${documentsTable} WHERE document_key = ? LIMIT 1`,
    args: [documentKey],
  });
  const blob = result.rows[0]?.data_blob;
  const buffer = blobToBuffer(blob);

  if (!buffer) {
    return fallback;
  }

  return JSON.parse(gunzipSync(buffer).toString("utf8"));
}

async function writeTursoDocument(client, documentKey, value) {
  const compressed = gzipSync(JSON.stringify(value));

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
}

async function readLocalJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

async function writeLocalJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

async function hashPassword(value, salt) {
  const derivedKey = await scrypt(value, salt, 64);

  return derivedKey.toString("hex");
}

function validateAdmin(valueUsername, valuePassword) {
  if (valueUsername.length < 3 || valueUsername.length > 48) {
    return "Admin username must be between 3 and 48 characters.";
  }

  if (!/^[a-zA-Z0-9_.-]+$/u.test(valueUsername)) {
    return "Admin username can only use letters, numbers, dots, dashes, and underscores.";
  }

  if (valuePassword.length < 12) {
    return "Admin password must be at least 12 characters.";
  }

  return "";
}

function generatePassword() {
  return randomBytes(18).toString("base64url");
}

function sameUsername(first, second) {
  return first.trim().toLowerCase() === second.trim().toLowerCase();
}

function blobToBuffer(value) {
  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }

  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }

  return null;
}

function isAdminUser(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    typeof value.username === "string" &&
    typeof value.passwordHash === "string" &&
    typeof value.passwordSalt === "string" &&
    typeof value.createdAt === "string"
  );
}

function isAdminLoginAttempt(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.usernameKey === "string" &&
    typeof value.failedAttempts === "number" &&
    typeof value.firstFailedAt === "string" &&
    (value.lockedUntil === undefined || typeof value.lockedUntil === "string")
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

