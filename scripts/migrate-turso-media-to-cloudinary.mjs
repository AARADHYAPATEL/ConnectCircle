import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { createClient } from "@libsql/client";

await loadEnvFile(".env.local");
await loadEnvFile(".env.turso.local", { override: true });

const tursoDatabaseUrl =
  process.env.TURSO_DATABASE_URL || process.env.LIBSQL_DATABASE_URL || "";
const tursoAuthToken =
  process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN || "";
const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim() || "";
const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY?.trim() || "";
const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET?.trim() || "";

if (!tursoDatabaseUrl) {
  console.error("Missing TURSO_DATABASE_URL.");
  process.exit(1);
}

if (!cloudinaryCloudName || !cloudinaryApiKey || !cloudinaryApiSecret) {
  console.error(
    "Missing Cloudinary credentials. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.",
  );
  process.exit(1);
}

const client = createClient({
  url: tursoDatabaseUrl,
  ...(tursoAuthToken ? { authToken: tursoAuthToken } : {}),
});

const tables = [
  {
    folder: "connectcircle/direct-chat",
    label: "direct chat",
    table: "connectcircle_chat_messages",
  },
  {
    folder: "connectcircle/circle-chat",
    label: "circle chat",
    table: "connectcircle_circle_messages",
  },
];

for (const table of tables) {
  await migrateTableMedia(table);
}

console.log("Done.");

async function migrateTableMedia({ folder, label, table }) {
  if (!(await tableExists(table))) {
    console.log(`Skipping ${label}: ${table} does not exist.`);
    return;
  }

  await ensureMediaColumns(table);

  const result = await client.execute({
    sql: `
      SELECT id, media_name, media_type, media_size, media_data
      FROM ${table}
      WHERE media_data IS NOT NULL
        AND (media_url IS NULL OR media_url = '')
      ORDER BY created_at ASC
    `,
    args: [],
  });

  console.log(`Migrating ${result.rows.length} ${label} media item(s).`);

  for (const row of result.rows) {
    const id = rowString(row, "id");
    const name = rowString(row, "media_name");
    const type = rowString(row, "media_type");
    const size = rowNumber(row, "media_size");
    const data = blobValueToBuffer(row.media_data);

    if (!id || !name || !type || !size || !data) {
      console.warn(`Skipping invalid ${label} row: ${id || "(missing id)"}`);
      continue;
    }

    const upload = await uploadCloudinaryMedia({
      data,
      folder,
      id,
      type,
    });

    await client.execute({
      sql: `
        UPDATE ${table}
        SET
          media_url = ?,
          media_public_id = ?,
          media_provider = 'cloudinary',
          media_data = NULL,
          updated_at = ?
        WHERE id = ?
      `,
      args: [
        upload.secureUrl,
        upload.publicId,
        new Date().toISOString(),
        id,
      ],
    });

    console.log(`Migrated ${label} media ${id} (${name}, ${size} bytes).`);
  }
}

async function tableExists(table) {
  const result = await client.execute({
    sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    args: [table],
  });

  return result.rows.length > 0;
}

async function ensureMediaColumns(table) {
  const result = await client.execute(`PRAGMA table_info(${table})`);
  const existingColumns = new Set(
    result.rows
      .map((row) => rowString(row, "name"))
      .filter((name) => Boolean(name)),
  );

  for (const [name, definition] of [
    ["media_url", "TEXT"],
    ["media_public_id", "TEXT"],
    ["media_provider", "TEXT"],
  ]) {
    if (!existingColumns.has(name)) {
      await client.execute(
        `ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`,
      );
    }
  }
}

async function uploadCloudinaryMedia({ data, folder, id, type }) {
  const resourceType = type.startsWith("video/") ? "video" : "image";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const publicId = `${cleanPublicIdPart(id)}-${Date.now()}`;
  const signedParameters = {
    folder,
    public_id: publicId,
    timestamp,
  };
  const formData = new FormData();

  formData.append("file", `data:${type};base64,${data.toString("base64")}`);
  formData.append("api_key", cloudinaryApiKey);
  formData.append("timestamp", timestamp);
  formData.append("folder", folder);
  formData.append("public_id", publicId);
  formData.append("signature", signCloudinaryParameters(signedParameters));

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudinaryCloudName}/${resourceType}/upload`,
    {
      method: "POST",
      body: formData,
    },
  );

  if (!response.ok) {
    throw new Error(`Cloudinary upload failed for ${id}: ${await response.text()}`);
  }

  const body = await response.json();

  if (!body.secure_url || !body.public_id) {
    throw new Error(`Cloudinary did not return a URL for ${id}.`);
  }

  return {
    publicId: body.public_id,
    secureUrl: body.secure_url,
  };
}

function signCloudinaryParameters(parameters) {
  const payload = Object.keys(parameters)
    .sort()
    .map((key) => `${key}=${parameters[key]}`)
    .join("&");

  return createHash("sha1")
    .update(`${payload}${cloudinaryApiSecret}`)
    .digest("hex");
}

function cleanPublicIdPart(value) {
  return (
    String(value)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "media"
  );
}

function blobValueToBuffer(value) {
  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }

  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }

  return null;
}

function rowString(row, key) {
  const value = row[key];

  return typeof value === "string" ? value : String(value ?? "");
}

function rowNumber(row, key) {
  const value = row[key];

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string") {
    const parsedValue = Number.parseInt(value, 10);

    return Number.isFinite(parsedValue) ? parsedValue : 0;
  }

  return 0;
}

async function loadEnvFile(filePath, options = {}) {
  let content = "";

  try {
    content = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return;
    }

    throw error;
  }

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (options.override || !process.env[key]) {
      process.env[key] = value;
    }
  }
}
