import { NextResponse } from "next/server";
import { createUser } from "@/lib/authStore";
import { setSessionCookie } from "@/lib/session";
import {
  isUserStorageConfigurationError,
  userStorageUnavailableMessage,
} from "@/lib/userStorageErrors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body: unknown = await request.json();

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const username = typeof input.username === "string" ? input.username : "";
  const email = typeof input.email === "string" ? input.email : "";
  const password = typeof input.password === "string" ? input.password : "";
  const result = await createUser({ username, email, password }).catch(
    (error) => {
      if (isUserStorageConfigurationError(error)) {
        return null;
      }

      throw error;
    },
  );

  if (!result) {
    return NextResponse.json(
      { error: userStorageUnavailableMessage },
      { status: 503 },
    );
  }

  if (!result.user) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const response = NextResponse.json({ user: result.user }, { status: 201 });
  setSessionCookie(response, result.user);

  return response;
}
