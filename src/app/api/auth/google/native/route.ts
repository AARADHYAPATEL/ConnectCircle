import { OAuth2Client } from "google-auth-library";
import { NextResponse } from "next/server";
import { getIpBlockedJsonResponse } from "@/lib/apiModeration";
import { findOrCreateGoogleUser } from "@/lib/authStore";
import { getUserSignInBlock } from "@/lib/moderationStore";
import { setSessionCookie } from "@/lib/session";
import { recordUserNetworkAccess } from "@/lib/userNetworkStore";
import {
  isUserStorageConfigurationError,
  userStorageUnavailableMessage,
} from "@/lib/userStorageErrors";

const googleClient = new OAuth2Client();

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ipBlockedResponse = await getIpBlockedJsonResponse(request);

  if (ipBlockedResponse) {
    return ipBlockedResponse;
  }

  const body: unknown = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const idToken = typeof input.idToken === "string" ? input.idToken : "";
  const nonce = typeof input.nonce === "string" ? input.nonce : "";
  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!idToken || !nonce) {
    return NextResponse.json(
      { error: "Google sign-in token is required." },
      { status: 400 },
    );
  }

  if (!clientId) {
    return NextResponse.json(
      { error: "Google sign-in is not configured yet." },
      { status: 503 },
    );
  }

  const ticket = await googleClient
    .verifyIdToken({
      audience: clientId,
      idToken,
    })
    .catch(() => null);
  const payload = ticket?.getPayload();
  const payloadNonce =
    payload && "nonce" in payload && typeof payload.nonce === "string"
      ? payload.nonce
      : "";

  if (
    !payload?.sub ||
    !payload.email ||
    payload.email_verified === false ||
    payloadNonce !== nonce
  ) {
    return NextResponse.json(
      { error: "Google sign-in could not be verified." },
      { status: 401 },
    );
  }

  const user = await findOrCreateGoogleUser({
    email: payload.email,
    name: payload.name ?? payload.email.split("@")[0],
    sub: payload.sub,
  }).catch((error) => {
    if (isUserStorageConfigurationError(error)) {
      return null;
    }

    throw error;
  });

  if (!user) {
    return NextResponse.json(
      { error: userStorageUnavailableMessage },
      { status: 503 },
    );
  }

  if (await getUserSignInBlock(user.username)) {
    return NextResponse.json(
      { error: "This account is not allowed to sign in." },
      { status: 403 },
    );
  }

  const response = NextResponse.json({ user });
  await recordUserNetworkAccess(user, request);
  setSessionCookie(response, user);

  return response;
}
