import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { getAdminById, type PublicAdminUser } from "@/lib/adminStore";

const adminSessionCookieName = "connectcircle_admin_session";
const adminSessionMaxAge = 60 * 60 * 8;

type AdminSessionPayload = {
  adminId: string;
  username: string;
  issuedAt: number;
};

function getAdminSessionSecret() {
  return (
    process.env.CONNECTCIRCLE_ADMIN_SESSION_SECRET ??
    process.env.CONNECTCIRCLE_SESSION_SECRET ??
    "connectcircle-local-dev-admin"
  );
}

function encodeBase64Url(value: string) {
  return Buffer.from(value)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );

  return Buffer.from(padded, "base64").toString("utf8");
}

function signPayload(encodedPayload: string) {
  return createHmac("sha256", getAdminSessionSecret())
    .update(encodedPayload)
    .digest("base64url");
}

function createAdminSessionToken(admin: PublicAdminUser) {
  const payload: AdminSessionPayload = {
    adminId: admin.id,
    username: admin.username,
    issuedAt: Date.now(),
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

function verifyAdminSessionToken(token: string) {
  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload);
  const signatureBuffer = Buffer.from(signature);
  const expectedSignatureBuffer = Buffer.from(expectedSignature);

  if (
    signatureBuffer.length !== expectedSignatureBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
  ) {
    return null;
  }

  try {
    const payload: unknown = JSON.parse(decodeBase64Url(encodedPayload));

    if (!isAdminSessionPayload(payload)) {
      return null;
    }

    if (Date.now() - payload.issuedAt > adminSessionMaxAge * 1000) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function setAdminSessionCookie(
  response: NextResponse,
  admin: PublicAdminUser,
) {
  response.cookies.set(adminSessionCookieName, createAdminSessionToken(admin), {
    httpOnly: true,
    maxAge: adminSessionMaxAge,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export function clearAdminSessionCookie(response: NextResponse) {
  response.cookies.set(adminSessionCookieName, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function getCurrentAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(adminSessionCookieName)?.value;

  if (!token) {
    return null;
  }

  const payload = verifyAdminSessionToken(token);

  if (!payload) {
    return null;
  }

  return getAdminById(payload.adminId);
}

function isAdminSessionPayload(value: unknown): value is AdminSessionPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<AdminSessionPayload>;

  return (
    typeof payload.adminId === "string" &&
    typeof payload.username === "string" &&
    typeof payload.issuedAt === "number"
  );
}

