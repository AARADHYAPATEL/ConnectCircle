import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import {
  getRequestHost,
  getRequestUrl,
  isPrivateNetworkHost,
} from "@/lib/requestOrigin";

const googleAuthorizationEndpoint =
  "https://accounts.google.com/o/oauth2/v2/auth";
const googleStateCookie = "connectcircle_google_state";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const authMode = url.searchParams.get("mode") === "register" ? "register" : "login";
  const authPath = `/auth/${authMode}`;
  const host = getRequestHost(request);

  if (host !== "localhost" && host !== "127.0.0.1" && isPrivateNetworkHost(host)) {
    return NextResponse.redirect(
      getRequestUrl(request, `${authPath}?error=google_private_ip`),
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    return NextResponse.redirect(
      getRequestUrl(request, `${authPath}?error=google_not_configured`),
    );
  }

  const state = randomBytes(24).toString("hex");
  const redirectUri = getRequestUrl(
    request,
    "/api/auth/google/callback",
  ).toString();
  const authorizationUrl = new URL(googleAuthorizationEndpoint);

  authorizationUrl.searchParams.set("client_id", clientId);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", "openid email profile");
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("prompt", "select_account");

  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set(googleStateCookie, state, {
    httpOnly: true,
    maxAge: 60 * 10,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
