import { NextResponse } from "next/server";
import { verifyUserCredentials } from "@/lib/authStore";
import { getIpBlockedJsonResponse } from "@/lib/apiModeration";
import { setSessionCookie } from "@/lib/session";
import { recordUserNetworkAccess } from "@/lib/userNetworkStore";
import {
  isUserStorageConfigurationError,
  userStorageUnavailableMessage,
} from "@/lib/userStorageErrors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ipBlockedResponse = await getIpBlockedJsonResponse(request);

  if (ipBlockedResponse) {
    return ipBlockedResponse;
  }

  const body: unknown = await request.json();

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const email = typeof input.email === "string" ? input.email : "";
  const password = typeof input.password === "string" ? input.password : "";
  const result = await verifyUserCredentials(email, password).catch((error) => {
    if (isUserStorageConfigurationError(error)) {
      return null;
    }

    throw error;
  });

  if (!result) {
    return NextResponse.json(
      { error: userStorageUnavailableMessage },
      { status: 503 },
    );
  }

  if (!result.user) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  const response = NextResponse.json({ user: result.user });
  await recordUserNetworkAccess(result.user, request);
  setSessionCookie(response, result.user);

  return response;
}
