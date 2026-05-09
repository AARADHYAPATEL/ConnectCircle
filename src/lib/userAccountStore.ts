import { promises as fs } from "node:fs";
import path from "node:path";
import { Pool, type QueryResultRow } from "pg";
import type { AuthProvider, UserAccount } from "@/lib/userAccountTypes";

const dataDirectory = path.join(process.cwd(), ".data");
const usersFile = path.join(dataDirectory, "users.json");
const userLoginAttemptsFile = path.join(
  dataDirectory,
  "user-login-attempts.json",
);
const usersTable = "connectcircle_users";
const userLoginAttemptsTable = "connectcircle_user_login_attempts";
const maxFailedLoginAttempts = 5;
const loginWindowMs = 15 * 60 * 1000;
const loginLockMs = 15 * 60 * 1000;

let pool: Pool | null = null;
let hasEnsuredPostgresSchema = false;

type UserRow = QueryResultRow & {
  id: string;
  username: string;
  username_key: string;
  email: string;
  display_name: string | null;
  bio: string | null;
  avatar_image: string | null;
  avatar_url: string | null;
  profile_visibility: string | null;
  availability_status: string | null;
  theme_preference: string | null;
  password_hash: string | null;
  password_salt: string | null;
  password_algorithm: string | null;
  google_sub: string | null;
  auth_providers: unknown;
  created_at: Date | string;
};

type UserLoginAttempt = {
  emailKey: string;
  failedAttempts: number;
  firstFailedAt: string;
  lockedUntil?: string;
};

type UserLoginAttemptRow = QueryResultRow & {
  email_key: string;
  failed_attempts: number;
  first_failed_at: Date | string;
  locked_until: Date | string | null;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeUsernameKey(username: string) {
  return username.trim().toLowerCase();
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

function shouldUsePostgres() {
  return Boolean(getPostgresConnectionString());
}

function assertProductionUserStoreConfigured() {
  if (
    !shouldUsePostgres() &&
    (process.env.VERCEL === "1" ||
      process.env.CONNECTCIRCLE_REQUIRE_DATABASE === "true")
  ) {
    throw new Error(
      "ConnectCircle user storage is not configured. Set DATABASE_URL or POSTGRES_URL before running in production.",
    );
  }
}

function getPool() {
  const connectionString = getPostgresConnectionString();

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
    CREATE TABLE IF NOT EXISTS ${usersTable} (
      id text PRIMARY KEY,
      username text NOT NULL,
      username_key text NOT NULL UNIQUE,
      email text NOT NULL UNIQUE,
      display_name text,
      bio text,
      avatar_image text,
      avatar_url text,
      profile_visibility text,
      availability_status text,
      theme_preference text,
      password_hash text,
      password_salt text,
      password_algorithm text,
      google_sub text,
      auth_providers jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    ALTER TABLE ${usersTable}
      ADD COLUMN IF NOT EXISTS password_algorithm text;

    CREATE UNIQUE INDEX IF NOT EXISTS connectcircle_users_google_sub_unique
      ON ${usersTable} (google_sub)
      WHERE google_sub IS NOT NULL;

    CREATE TABLE IF NOT EXISTS ${userLoginAttemptsTable} (
      email_key text PRIMARY KEY,
      failed_attempts integer NOT NULL,
      first_failed_at timestamptz NOT NULL,
      locked_until timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  hasEnsuredPostgresSchema = true;
}

function parseAuthProviders(value: unknown): AuthProvider[] | undefined {
  let providers: unknown = [];

  if (Array.isArray(value)) {
    providers = value;
  } else if (typeof value === "string") {
    try {
      providers = JSON.parse(value);
    } catch {
      providers = [];
    }
  }

  if (!Array.isArray(providers)) {
    return undefined;
  }

  return providers.filter(
    (provider): provider is AuthProvider =>
      provider === "password" || provider === "google",
  );
}

function dateToIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

function rowToUser(row: UserRow): UserAccount {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    displayName: row.display_name ?? undefined,
    bio: row.bio ?? undefined,
    avatarImage: row.avatar_image ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    profileVisibility: row.profile_visibility as UserAccount["profileVisibility"],
    availabilityStatus: row.availability_status as UserAccount["availabilityStatus"],
    themePreference: row.theme_preference as UserAccount["themePreference"],
    passwordHash: row.password_hash ?? undefined,
    passwordSalt: row.password_salt ?? undefined,
    passwordAlgorithm: row.password_algorithm ?? undefined,
    googleSub: row.google_sub ?? undefined,
    authProviders: parseAuthProviders(row.auth_providers),
    createdAt: dateToIso(row.created_at),
  };
}

function userToPostgresValues(user: UserAccount) {
  return [
    user.id,
    user.username,
    normalizeUsernameKey(user.username),
    normalizeEmail(user.email),
    user.displayName ?? null,
    user.bio ?? null,
    user.avatarImage ?? null,
    user.avatarUrl ?? null,
    user.profileVisibility ?? null,
    user.availabilityStatus ?? null,
    user.themePreference ?? null,
    user.passwordHash ?? null,
    user.passwordSalt ?? null,
    user.passwordAlgorithm ?? null,
    user.googleSub ?? null,
    JSON.stringify(user.authProviders ?? []),
    user.createdAt,
  ];
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

async function readJsonUsers() {
  assertProductionUserStoreConfigured();

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

async function writeJsonUsers(users: UserAccount[]) {
  assertProductionUserStoreConfigured();
  await fs.mkdir(dataDirectory, { recursive: true });

  const temporaryFile = `${usersFile}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(users, null, 2), "utf8");
  await fs.rename(temporaryFile, usersFile);
}

async function readJsonLoginAttempts() {
  assertProductionUserStoreConfigured();

  try {
    const file = await fs.readFile(userLoginAttemptsFile, "utf8");
    const parsed: unknown = JSON.parse(file);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isUserLoginAttempt);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function writeJsonLoginAttempts(attempts: UserLoginAttempt[]) {
  assertProductionUserStoreConfigured();
  await fs.mkdir(dataDirectory, { recursive: true });

  const temporaryFile = `${userLoginAttemptsFile}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(attempts, null, 2), "utf8");
  await fs.rename(temporaryFile, userLoginAttemptsFile);
}

async function readPostgresUsers() {
  await ensurePostgresSchema();

  const result = await getPool().query<UserRow>(
    `SELECT * FROM ${usersTable} ORDER BY created_at DESC`,
  );

  return result.rows.map(rowToUser);
}

async function findPostgresUserById(userId: string) {
  await ensurePostgresSchema();

  const result = await getPool().query<UserRow>(
    `SELECT * FROM ${usersTable} WHERE id = $1 LIMIT 1`,
    [userId],
  );

  return result.rows[0] ? rowToUser(result.rows[0]) : null;
}

async function findPostgresUserByEmail(email: string) {
  await ensurePostgresSchema();

  const result = await getPool().query<UserRow>(
    `SELECT * FROM ${usersTable} WHERE email = $1 LIMIT 1`,
    [normalizeEmail(email)],
  );

  return result.rows[0] ? rowToUser(result.rows[0]) : null;
}

async function findPostgresUserByUsernameKey(usernameKey: string) {
  await ensurePostgresSchema();

  const result = await getPool().query<UserRow>(
    `SELECT * FROM ${usersTable} WHERE username_key = $1 LIMIT 1`,
    [normalizeUsernameKey(usernameKey)],
  );

  return result.rows[0] ? rowToUser(result.rows[0]) : null;
}

async function findPostgresUserByGoogleSub(googleSub: string) {
  await ensurePostgresSchema();

  const result = await getPool().query<UserRow>(
    `SELECT * FROM ${usersTable} WHERE google_sub = $1 LIMIT 1`,
    [googleSub],
  );

  return result.rows[0] ? rowToUser(result.rows[0]) : null;
}

async function insertPostgresUser(user: UserAccount) {
  await ensurePostgresSchema();

  await getPool().query(
    `
      INSERT INTO ${usersTable} (
        id,
        username,
        username_key,
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
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14, $15, $16::jsonb, $17
      )
    `,
    userToPostgresValues(user),
  );
}

async function updatePostgresUser(user: UserAccount) {
  await ensurePostgresSchema();

  await getPool().query(
    `
      UPDATE ${usersTable}
      SET
        username = $2,
        username_key = $3,
        email = $4,
        display_name = $5,
        bio = $6,
        avatar_image = $7,
        avatar_url = $8,
        profile_visibility = $9,
        availability_status = $10,
        theme_preference = $11,
        password_hash = $12,
        password_salt = $13,
        password_algorithm = $14,
        google_sub = $15,
        auth_providers = $16::jsonb,
        created_at = $17,
        updated_at = now()
      WHERE id = $1
    `,
    userToPostgresValues(user),
  );
}

async function searchPostgresUsersByUsername({
  excludeUsernameKey,
  limit,
  query,
}: {
  excludeUsernameKey: string;
  limit: number;
  query: string;
}) {
  await ensurePostgresSchema();

  const cleanQuery = normalizeUsernameKey(query);
  const likeQuery = `%${escapeLikePattern(cleanQuery)}%`;
  const startsWithQuery = `${escapeLikePattern(cleanQuery)}%`;
  const result = await getPool().query<UserRow>(
    `
      SELECT *
      FROM ${usersTable}
      WHERE username_key <> $1
        AND username_key LIKE $2 ESCAPE '\\'
      ORDER BY
        CASE WHEN username_key LIKE $3 ESCAPE '\\' THEN 0 ELSE 1 END,
        username_key ASC
      LIMIT $4
    `,
    [excludeUsernameKey, likeQuery, startsWithQuery, limit],
  );

  return result.rows.map(rowToUser);
}

function rowToLoginAttempt(row: UserLoginAttemptRow): UserLoginAttempt {
  return {
    emailKey: row.email_key,
    failedAttempts: row.failed_attempts,
    firstFailedAt: dateToIso(row.first_failed_at),
    ...(row.locked_until ? { lockedUntil: dateToIso(row.locked_until) } : {}),
  };
}

function getActiveLoginAttempt(
  attempts: UserLoginAttempt[],
  emailKey: string,
) {
  const now = Date.now();
  const attempt = attempts.find(
    (currentAttempt) => currentAttempt.emailKey === emailKey,
  );

  if (!attempt) {
    return null;
  }

  if (attempt.lockedUntil && new Date(attempt.lockedUntil).getTime() > now) {
    return attempt;
  }

  if (now - new Date(attempt.firstFailedAt).getTime() > loginWindowMs) {
    return null;
  }

  return attempt;
}

async function findPostgresLoginAttempt(emailKey: string) {
  await ensurePostgresSchema();

  const result = await getPool().query<UserLoginAttemptRow>(
    `SELECT * FROM ${userLoginAttemptsTable} WHERE email_key = $1 LIMIT 1`,
    [emailKey],
  );

  return result.rows[0] ? rowToLoginAttempt(result.rows[0]) : null;
}

async function recordPostgresLoginFailure(emailKey: string) {
  await ensurePostgresSchema();

  const now = new Date();
  const existingAttempt = await findPostgresLoginAttempt(emailKey);
  const activeAttempt = existingAttempt
    ? getActiveLoginAttempt([existingAttempt], emailKey)
    : null;
  const nextFailedAttempts = (activeAttempt?.failedAttempts ?? 0) + 1;
  const nextAttempt: UserLoginAttempt = {
    emailKey,
    failedAttempts: nextFailedAttempts,
    firstFailedAt: activeAttempt?.firstFailedAt ?? now.toISOString(),
    ...(nextFailedAttempts >= maxFailedLoginAttempts
      ? {
          lockedUntil: new Date(now.getTime() + loginLockMs).toISOString(),
        }
      : {}),
  };

  await getPool().query(
    `
      INSERT INTO ${userLoginAttemptsTable} (
        email_key,
        failed_attempts,
        first_failed_at,
        locked_until
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (email_key) DO UPDATE
      SET
        failed_attempts = EXCLUDED.failed_attempts,
        first_failed_at = EXCLUDED.first_failed_at,
        locked_until = EXCLUDED.locked_until,
        updated_at = now()
    `,
    [
      nextAttempt.emailKey,
      nextAttempt.failedAttempts,
      nextAttempt.firstFailedAt,
      nextAttempt.lockedUntil ?? null,
    ],
  );
}

async function clearPostgresLoginFailures(emailKey: string) {
  await ensurePostgresSchema();

  await getPool().query(
    `DELETE FROM ${userLoginAttemptsTable} WHERE email_key = $1`,
    [emailKey],
  );
}

export async function getAllUserAccounts() {
  return shouldUsePostgres() ? readPostgresUsers() : readJsonUsers();
}

export async function findUserAccountById(userId: string) {
  if (shouldUsePostgres()) {
    return findPostgresUserById(userId);
  }

  const users = await readJsonUsers();

  return users.find((user) => user.id === userId) ?? null;
}

export async function findUserAccountByEmail(email: string) {
  if (shouldUsePostgres()) {
    return findPostgresUserByEmail(email);
  }

  const cleanEmail = normalizeEmail(email);
  const users = await readJsonUsers();

  return users.find((user) => normalizeEmail(user.email) === cleanEmail) ?? null;
}

export async function findUserAccountByUsernameKey(usernameKey: string) {
  if (shouldUsePostgres()) {
    return findPostgresUserByUsernameKey(usernameKey);
  }

  const cleanUsernameKey = normalizeUsernameKey(usernameKey);
  const users = await readJsonUsers();

  return (
    users.find(
      (user) => normalizeUsernameKey(user.username) === cleanUsernameKey,
    ) ?? null
  );
}

export async function findUserAccountByGoogleSub(googleSub: string) {
  if (shouldUsePostgres()) {
    return findPostgresUserByGoogleSub(googleSub);
  }

  const users = await readJsonUsers();

  return users.find((user) => user.googleSub === googleSub) ?? null;
}

export async function insertUserAccount(user: UserAccount) {
  if (shouldUsePostgres()) {
    await insertPostgresUser(user);
    return;
  }

  const users = await readJsonUsers();
  await writeJsonUsers([...users, user]);
}

export async function updateUserAccount(user: UserAccount) {
  if (shouldUsePostgres()) {
    await updatePostgresUser(user);
    return;
  }

  const users = await readJsonUsers();
  await writeJsonUsers(
    users.map((currentUser) =>
      currentUser.id === user.id ? user : currentUser,
    ),
  );
}

export async function searchUserAccountsByUsername({
  excludeUsernameKey,
  limit,
  query,
}: {
  excludeUsernameKey: string;
  limit: number;
  query: string;
}) {
  if (shouldUsePostgres()) {
    return searchPostgresUsersByUsername({ excludeUsernameKey, limit, query });
  }

  const cleanQuery = normalizeUsernameKey(query);
  const users = await readJsonUsers();

  return users
    .filter((user) => {
      const usernameKey = normalizeUsernameKey(user.username);

      return usernameKey !== excludeUsernameKey && usernameKey.includes(cleanQuery);
    })
    .sort((first, second) => {
      const firstUsername = normalizeUsernameKey(first.username);
      const secondUsername = normalizeUsernameKey(second.username);
      const firstStartsWithQuery = firstUsername.startsWith(cleanQuery);
      const secondStartsWithQuery = secondUsername.startsWith(cleanQuery);

      if (firstStartsWithQuery !== secondStartsWithQuery) {
        return firstStartsWithQuery ? -1 : 1;
      }

      return firstUsername.localeCompare(secondUsername);
    })
    .slice(0, limit);
}

export async function getUserLoginLockedError(emailKey: string) {
  const cleanEmailKey = normalizeEmail(emailKey);
  const attempt = shouldUsePostgres()
    ? await findPostgresLoginAttempt(cleanEmailKey)
    : getActiveLoginAttempt(await readJsonLoginAttempts(), cleanEmailKey);
  const activeAttempt = attempt
    ? getActiveLoginAttempt([attempt], cleanEmailKey)
    : null;

  if (!activeAttempt?.lockedUntil) {
    return "";
  }

  const lockedUntilMs = new Date(activeAttempt.lockedUntil).getTime();

  if (lockedUntilMs <= Date.now()) {
    return "";
  }

  const minutesRemaining = Math.max(
    1,
    Math.ceil((lockedUntilMs - Date.now()) / 60000),
  );

  return `Too many failed login attempts. Try again in ${minutesRemaining} minute${minutesRemaining === 1 ? "" : "s"}.`;
}

export async function recordUserLoginFailure(emailKey: string) {
  const cleanEmailKey = normalizeEmail(emailKey);

  if (shouldUsePostgres()) {
    await recordPostgresLoginFailure(cleanEmailKey);
    return;
  }

  const attempts = await readJsonLoginAttempts();
  const now = new Date();
  const activeAttempt = getActiveLoginAttempt(attempts, cleanEmailKey);
  const nextFailedAttempts = (activeAttempt?.failedAttempts ?? 0) + 1;
  const nextAttempt: UserLoginAttempt = {
    emailKey: cleanEmailKey,
    failedAttempts: nextFailedAttempts,
    firstFailedAt: activeAttempt?.firstFailedAt ?? now.toISOString(),
    ...(nextFailedAttempts >= maxFailedLoginAttempts
      ? {
          lockedUntil: new Date(now.getTime() + loginLockMs).toISOString(),
        }
      : {}),
  };

  await writeJsonLoginAttempts([
    nextAttempt,
    ...attempts.filter((attempt) => attempt.emailKey !== cleanEmailKey),
  ]);
}

export async function clearUserLoginFailures(emailKey: string) {
  const cleanEmailKey = normalizeEmail(emailKey);

  if (shouldUsePostgres()) {
    await clearPostgresLoginFailures(cleanEmailKey);
    return;
  }

  const attempts = await readJsonLoginAttempts();

  await writeJsonLoginAttempts(
    attempts.filter((attempt) => attempt.emailKey !== cleanEmailKey),
  );
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

function isUserLoginAttempt(value: unknown): value is UserLoginAttempt {
  if (!value || typeof value !== "object") {
    return false;
  }

  const attempt = value as Partial<UserLoginAttempt>;

  return (
    typeof attempt.emailKey === "string" &&
    typeof attempt.failedAttempts === "number" &&
    typeof attempt.firstFailedAt === "string" &&
    (typeof attempt.lockedUntil === "undefined" ||
      typeof attempt.lockedUntil === "string")
  );
}
