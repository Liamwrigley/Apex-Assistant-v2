import { getLeaderboardWithDelta24h, getRankTimelinesByTrackedAccountIds } from "@apex-assistant/db";
import { cacheRead, CacheKeys } from "@apex-assistant/cache";
import { NextResponse } from "next/server";
import { debugLog } from "@/app/api/_lib/log";
import { toApiError } from "@/app/api/_lib/responses";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const guildId = url.searchParams.get("guildId");
    const hours = Number(url.searchParams.get("hours") ?? "168");

    const timelines = await cacheRead(
      CacheKeys.lbTimelines(guildId ?? undefined, hours),
      async () => {
        const leaderboard = await getLeaderboardWithDelta24h(guildId ?? undefined);
        const trackedIds = leaderboard.map((row) => row.trackedAccountId);
        return getRankTimelinesByTrackedAccountIds(trackedIds, hours);
      },
    );

    debugLog("leaderboard-timelines", "loaded", {
      guildId: guildId ?? null,
      hours,
    });

    return NextResponse.json(timelines);
  } catch (error) {
    debugLog("leaderboard-timelines", "error", { message: error instanceof Error ? error.message : "Unknown error" });
    return toApiError(error);
  }
}
