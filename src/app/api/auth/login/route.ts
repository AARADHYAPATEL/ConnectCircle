import { NextResponse } from "next/server";
import { verifyUser } from "@/lib/authStore";
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
  const user = await verifyUser(email, password);

  if (!user) {
    return NextResponse.json(
      { error: "Email or password is incorrect." },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ user });
  setSessionCookie(response, user);

  return response;
}
