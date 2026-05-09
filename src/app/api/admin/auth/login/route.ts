import { NextResponse } from "next/server";
import { verifyAdminCredentials } from "@/lib/adminStore";
import { setAdminSessionCookie } from "@/lib/adminSession";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const username = typeof input.username === "string" ? input.username : "";
  const password = typeof input.password === "string" ? input.password : "";
  const result = await verifyAdminCredentials(username, password);

  if (result.error || !result.admin) {
    return NextResponse.json(
      { error: result.error || "Admin sign-in failed." },
      { status: result.status },
    );
  }

  const response = NextResponse.json({ admin: result.admin });
  setAdminSessionCookie(response, result.admin);

  return response;
}

