import { AppError, SlidingWindowLimiter } from "@apex-assistant/core";
import { getMatchesByPlayer } from "@apex-assistant/db";
import { NextResponse } from "next/server";
import { toApiError } from "@/app/api/_lib/responses";

const limiter = new SlidingWindowLimiter(
  Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60000),
  Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 60)
);

export async function GET(
  request: Request,
  context: { params: Promise<{ platform: string; ign: string }> }
): Promise<NextResponse> {
  try {
    const { platform, ign } = await context.params;
    const url = new URL(request.url);
    const guildId = url.searchParams.get("guildId");
    const limit = Number(url.searchParams.get("limit") ?? 25);
    const userId = request.headers.get("x-user-id") ?? "anonymous";

    if (!guildId) {
      throw new AppError("Missing guildId query param.", 400, "BAD_REQUEST");
    }

    limiter.assertAllowed(`${guildId}:${userId}:matches`);
    const matches = await getMatchesByPlayer({ guildId, ign, platform, limit });
    return NextResponse.json(matches);
  } catch (error) {
    return toApiError(error);
  }
}
