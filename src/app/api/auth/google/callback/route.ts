import { NextResponse } from "next/server";
import { findOrCreateGoogleUser } from "@/lib/authStore";
import { getRequestUrl } from "@/lib/requestOrigin";
import { setSessionCookie } from "@/lib/session";

const googleTokenEndpoint = "https://oauth2.googleapis.com/token";
const googleUserInfoEndpoint = "https://openidconnect.googleapis.com/v1/userinfo";
const googleStateCookie = "connectcircle_google_state";

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
};

type GoogleUserInfo = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
};

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieHeader = request.headers.get("cookie") ?? "";
  const savedState = readCookie(cookieHeader, googleStateCookie);

  if (!code || !state || !savedState || state !== savedState) {
    return NextResponse.redirect(
      getRequestUrl(request, "/auth/login?error=google_state"),
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      getRequestUrl(request, "/auth/login?error=google_not_configured"),
    );
  }

  const redirectUri = getRequestUrl(
    request,
    "/api/auth/google/callback",
  ).toString();
  const tokenResponse = await fetch(googleTokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  const tokenData: GoogleTokenResponse = await tokenResponse.json();

  if (!tokenResponse.ok || !tokenData.access_token) {
    return NextResponse.redirect(
      getRequestUrl(request, "/auth/login?error=google_token"),
    );
  }

  const userInfoResponse = await fetch(googleUserInfoEndpoint, {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
    },
  });
  const googleUser: GoogleUserInfo = await userInfoResponse.json();

  if (
    !userInfoResponse.ok ||
    !googleUser.sub ||
    !googleUser.email ||
    googleUser.email_verified === false
  ) {
    return NextResponse.redirect(
      getRequestUrl(request, "/auth/login?error=google_profile"),
    );
  }

  const user = await findOrCreateGoogleUser({
    email: googleUser.email,
    name: googleUser.name ?? googleUser.email.split("@")[0],
    sub: googleUser.sub,
  });
  const response = NextResponse.redirect(getRequestUrl(request, "/"));

  response.cookies.set(googleStateCookie, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  setSessionCookie(response, user);

  return response;
}

function readCookie(cookieHeader: string, name: string) {
  return cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
