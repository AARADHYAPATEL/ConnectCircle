import type { Row as TursoRow } from "@libsql/client";

export function tursoRowString(row: TursoRow, key: string) {
  const value = row[key];

  return typeof value === "string" ? value : String(value ?? "");
}

export function tursoRowOptionalString(row: TursoRow, key: string) {
  const value = row[key];

  return typeof value === "string" && value ? value : null;
}

export function tursoRowNumber(row: TursoRow, key: string) {
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

export function tursoRowOptionalNumber(row: TursoRow, key: string) {
  const value = row[key];

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string") {
    const parsedValue = Number.parseInt(value, 10);

    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  return null;
}
