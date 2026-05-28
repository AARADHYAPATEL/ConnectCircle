import { createClient, type Client } from "@libsql/client";
import { gzipSync, gunzipSync } from "node:zlib";

const documentsTable = "connectcircle_documents";

let client: Client | null = null;
let hasEnsuredDocumentSchema = false;

type JsonDocumentValidator<T> = (value: unknown) => T;

function getTursoDatabaseUrl() {
  return (
    process.env.TURSO_DATABASE_URL ||
    process.env.LIBSQL_DATABASE_URL ||
    ""
  );
}

function getTursoAuthToken() {
  return process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN || "";
}

export function shouldUseTurso() {
  return Boolean(getTursoDatabaseUrl());
}

export function getTursoClient() {
  const url = getTursoDatabaseUrl();

  if (!url) {
    throw new Error("Turso database URL is not configured.");
  }

  if (!client) {
    const authToken = getTursoAuthToken();

    client = createClient({
      url,
      ...(authToken ? { authToken } : {}),
    });
  }

  return client;
}

export function tursoBlobValueToBuffer(value: unknown) {
  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }

  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }

  return null;
}

export function valueToCompressedTursoBlob(value: unknown) {
  return new Uint8Array(gzipSync(JSON.stringify(value)));
}

export function compressedTursoBlobToJson<T>(
  value: unknown,
  validate?: JsonDocumentValidator<T>,
) {
  const compressedBuffer = tursoBlobValueToBuffer(value);

  if (!compressedBuffer) {
    return null;
  }

  const parsed: unknown = JSON.parse(gunzipSync(compressedBuffer).toString("utf8"));

  return validate ? validate(parsed) : (parsed as T);
}

export async function ensureTursoDocumentSchema() {
  if (hasEnsuredDocumentSchema) {
    return;
  }

  await getTursoClient().execute(`
    CREATE TABLE IF NOT EXISTS ${documentsTable} (
      document_key TEXT PRIMARY KEY,
      data_blob BLOB NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  hasEnsuredDocumentSchema = true;
}

export async function readTursoJsonDocument<T>(
  documentKey: string,
  fallback: T,
  validate?: JsonDocumentValidator<T>,
) {
  await ensureTursoDocumentSchema();

  const result = await getTursoClient().execute({
    sql: `SELECT data_blob FROM ${documentsTable} WHERE document_key = ? LIMIT 1`,
    args: [documentKey],
  });
  return compressedTursoBlobToJson(result.rows[0]?.data_blob, validate) ?? fallback;
}

export async function writeTursoJsonDocument<T>(
  documentKey: string,
  value: T,
) {
  await ensureTursoDocumentSchema();

  await getTursoClient().execute({
    sql: `
      INSERT INTO ${documentsTable} (document_key, data_blob, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(document_key) DO UPDATE SET
        data_blob = excluded.data_blob,
        updated_at = excluded.updated_at
    `,
    args: [
      documentKey,
      valueToCompressedTursoBlob(value),
      new Date().toISOString(),
    ],
  });
}
