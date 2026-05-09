import { NextResponse } from "next/server";
import { clearAdminSessionCookie } from "@/lib/adminSession";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearAdminSessionCookie(response);

  return response;
}

