import { SlidingWindowLimiter } from "@apex-assistant/core";
import { getLeaderboardWithDelta24h } from "@apex-assistant/db";
import { cacheRead, CacheKeys } from "@apex-assistant/cache";
import { NextResponse } from "next/server";
import { debugLog } from "@/app/api/_lib/log";
import { toApiError } from "@/app/api/_lib/responses";

const limiter = new SlidingWindowLimiter(
  Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60000),
  Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 60)
);

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const guildId = url.searchParams.get("guildId");
    const userId = request.headers.get("x-user-id") ?? "anonymous";

    const limiterKey = `${guildId ?? "all"}:${userId}:leaderboard`;
    debugLog("leaderboard", "request", { guildId: guildId ?? null, userId });
    limiter.assertAllowed(limiterKey);

    const rows = await cacheRead(
      CacheKeys.leaderboard(guildId ?? undefined),
      async () => {
        const data = await getLeaderboardWithDelta24h(guildId ?? undefined);
        return data.sort((a, b) => b.rankScore - a.rankScore);
      },
    );

    debugLog("leaderboard", "rows loaded", { guildId, count: rows.length });
    return NextResponse.json(rows);
  } catch (error) {
    debugLog("leaderboard", "error", { message: error instanceof Error ? error.message : "Unknown error" });
    return toApiError(error);
  }
}
