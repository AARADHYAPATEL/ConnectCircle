import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { getUserById, type PublicUser } from "@/lib/authStore";

const sessionCookieName = "connectcircle_session";
const sessionMaxAge = 60 * 60 * 24 * 7;

type SessionPayload = {
  userId: string;
  username: string;
  email: string;
  issuedAt: number;
};

function getSessionSecret() {
  return process.env.CONNECTCIRCLE_SESSION_SECRET ?? "connectcircle-local-dev";
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
  return createHmac("sha256", getSessionSecret())
    .update(encodedPayload)
    .digest("base64url");
}

function createSessionToken(user: PublicUser) {
  const payload: SessionPayload = {
    userId: user.id,
    username: user.username,
    email: user.email,
    issuedAt: Date.now(),
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

function verifySessionToken(token: string) {
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

    if (!isSessionPayload(payload)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function setSessionCookie(response: NextResponse, user: PublicUser) {
  response.cookies.set(sessionCookieName, createSessionToken(user), {
    httpOnly: true,
    maxAge: sessionMaxAge,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(sessionCookieName, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;

  if (!token) {
    return null;
  }

  const payload = verifySessionToken(token);

  if (!payload) {
    return null;
  }

  return getUserById(payload.userId);
}

function isSessionPayload(value: unknown): value is SessionPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<SessionPayload>;

  return (
    typeof payload.userId === "string" &&
    typeof payload.username === "string" &&
    typeof payload.email === "string" &&
    typeof payload.issuedAt === "number"
  );
}
