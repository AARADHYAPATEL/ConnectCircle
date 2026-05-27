import { NextResponse } from "next/server";
import { getMutationBlockedResponse } from "@/lib/apiModeration";
import { createFeedback } from "@/lib/feedbackStore";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const moderationResponse = await getMutationBlockedResponse(user.username);

  if (moderationResponse) {
    return moderationResponse;
  }

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
  const result = await createFeedback(user, {
    affectedPage:
      typeof input.affectedPage === "string" ? input.affectedPage : "",
    allowContact: input.allowContact === true,
    category: input.category,
    feature: input.feature,
    imageAttachments: input.imageAttachments,
    message: typeof input.message === "string" ? input.message : "",
    page: input.page,
    severity: input.severity,
  });

  if (result.error || !result.feedback) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(
    {
      emailStatus: result.feedback.emailStatus,
      feedback: result.feedback,
    },
    { status: 201 },
  );
}
