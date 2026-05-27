import { NextResponse } from "next/server";
import { getIpBanBlock, getUserMutationBlock } from "@/lib/moderationStore";
import { getClientIp } from "@/lib/requestIdentity";

export async function getMutationBlockedResponse(username: string) {
  const block = await getUserMutationBlock(username);

  return block
    ? NextResponse.json({ error: block.message }, { status: 403 })
    : null;
}

export async function getIpBlockedJsonResponse(request: Request) {
  const clientIp = getClientIp(request);
  const block = await getIpBanBlock(clientIp);

  return block
    ? NextResponse.json({ error: block.message }, { status: 403 })
    : null;
}
