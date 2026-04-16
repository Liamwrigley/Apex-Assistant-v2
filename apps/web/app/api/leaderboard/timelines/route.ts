import { getLeaderboardWithDelta24h, getRankTimelinesByTrackedAccountIds } from "@apex-assistant/db";
import { NextResponse } from "next/server";
import { debugLog } from "@/app/api/_lib/log";
import { toApiError } from "@/app/api/_lib/responses";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const guildId = url.searchParams.get("guildId");
    const hours = Number(url.searchParams.get("hours") ?? "168");

    const leaderboard = await getLeaderboardWithDelta24h(guildId ?? undefined);
    const trackedIds = leaderboard.map((row) => row.trackedAccountId);
    const timelines = await getRankTimelinesByTrackedAccountIds(trackedIds, hours);

    debugLog("leaderboard-timelines", "loaded", {
      guildId: guildId ?? null,
      hours,
      players: trackedIds.length
    });

    return NextResponse.json(timelines, {
      headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=240" },
    });
  } catch (error) {
    debugLog("leaderboard-timelines", "error", { message: error instanceof Error ? error.message : "Unknown error" });
    return toApiError(error);
  }
}
