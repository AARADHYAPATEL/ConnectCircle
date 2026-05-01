import { NextResponse } from "next/server";
import { getConnectionSummary } from "@/lib/connectionStore";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const summary = await getConnectionSummary(user.username);

  return NextResponse.json(summary);
}
