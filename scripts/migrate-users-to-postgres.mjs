import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Pool } = pg;
const usersTable = "connectcircle_users";
const legacyPasswordAlgorithm = "scrypt:legacy-node-defaults:keylen=64";

await loadEnvFile(".env.local");

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  "";

if (!connectionString) {
  console.error(
    "Missing DATABASE_URL or POSTGRES_URL. Add your Postgres connection string before migrating users.",
  );
  process.exit(1);
}

const usersFile =
  process.argv[2] || path.join(process.cwd(), ".data", "users.json");
const users = await readUsers(usersFile);

if (users.length === 0) {
  console.log(`No users found in ${usersFile}.`);
  process.exit(0);
}

const pool = new Pool({
  connectionString: normalizePostgresSslMode(connectionString),
  max: 1,
});

try {
  await ensureSchema(pool);

  for (const user of users) {
    const normalizedUser = normalizeUserForPostgres(user);
    const existingUserId = await findExistingUserId(pool, normalizedUser);

    await upsertUser(pool, {
      ...normalizedUser,
      id: existingUserId ?? normalizedUser.id,
    });
  }

  console.log(`Migrated ${users.length} user account(s) to Postgres.`);
} finally {
  await pool.end();
}

async function readUsers(filePath) {
  const file = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(file);

  if (!Array.isArray(parsed)) {
    throw new Error(`${filePath} must contain a JSON array.`);
  }

  return parsed.filter(
    (user) =>
      user &&
      typeof user === "object" &&
      typeof user.id === "string" &&
      typeof user.username === "string" &&
      typeof user.email === "string" &&
      typeof user.createdAt === "string",
  );
}

function normalizeUserForPostgres(user) {
  return {
    ...user,
    authProviders: Array.isArray(user.authProviders) ? user.authProviders : [],
    email: user.email.trim().toLowerCase(),
    passwordAlgorithm:
      user.passwordHash && user.passwordSalt && !user.passwordAlgorithm
        ? legacyPasswordAlgorithm
        : user.passwordAlgorithm,
  };
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

    CREATE UNIQUE INDEX IF NOT EXISTS connectcircle_users_google_sub_unique
      ON ${usersTable} (google_sub)
      WHERE google_sub IS NOT NULL;

    CREATE TABLE IF NOT EXISTS connectcircle_user_login_attempts (
      email_key text PRIMARY KEY,
      failed_attempts integer NOT NULL,
      first_failed_at timestamptz NOT NULL,
      locked_until timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function findExistingUserId(db, user) {
  const result = await db.query(
    `
      SELECT id
      FROM ${usersTable}
      WHERE
        id = $1
        OR username_key = $2
        OR email = $3
        OR ($4::text IS NOT NULL AND google_sub = $4)
      ORDER BY
        CASE
          WHEN id = $1 THEN 0
          WHEN google_sub = $4 THEN 1
          WHEN email = $3 THEN 2
          ELSE 3
        END
      LIMIT 1
    `,
    [user.id, user.username.trim().toLowerCase(), user.email, user.googleSub ?? null],
  );

  return result.rows[0]?.id ?? null;
}

async function upsertUser(db, user) {
  const values = [
    user.id,
    user.username,
    user.username.trim().toLowerCase(),
    user.email,
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
    JSON.stringify(user.authProviders),
    user.createdAt,
  ];

  await db.query(
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
      ON CONFLICT (id) DO UPDATE
      SET
        username = EXCLUDED.username,
        username_key = EXCLUDED.username_key,
        email = EXCLUDED.email,
        display_name = EXCLUDED.display_name,
        bio = EXCLUDED.bio,
        avatar_image = EXCLUDED.avatar_image,
        avatar_url = EXCLUDED.avatar_url,
        profile_visibility = EXCLUDED.profile_visibility,
        availability_status = EXCLUDED.availability_status,
        theme_preference = EXCLUDED.theme_preference,
        password_hash = EXCLUDED.password_hash,
        password_salt = EXCLUDED.password_salt,
        password_algorithm = EXCLUDED.password_algorithm,
        google_sub = EXCLUDED.google_sub,
        auth_providers = EXCLUDED.auth_providers,
        updated_at = now()
    `,
    values,
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
