import { NextResponse } from "next/server";
import { verifyUserCredentials } from "@/lib/authStore";
import { setSessionCookie } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body: unknown = await request.json();

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const email = typeof input.email === "string" ? input.email : "";
  const password = typeof input.password === "string" ? input.password : "";
  const result = await verifyUserCredentials(email, password);

  if (!result.user) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  const response = NextResponse.json({ user: result.user });
  setSessionCookie(response, result.user);

  return response;
}
