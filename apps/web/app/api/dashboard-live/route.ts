import { NextResponse } from "next/server";
import { cacheRead, CacheKeys } from "@apex-assistant/cache";
import { debugLog } from "@/app/api/_lib/log";
import { toApiError } from "@/app/api/_lib/responses";
import { computeDashboardLive } from "@/lib/dashboard-live";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const guildId = url.searchParams.get("guildId");
    debugLog("dashboard-live", "request", { guildId: guildId ?? null });

    const payload = await cacheRead(
      CacheKeys.dashboardLive(guildId ?? undefined),
      () => computeDashboardLive(guildId ?? undefined),
    );

    debugLog("dashboard-live", "loaded", {
      leaderboard: payload.leaderboard.length,
      tracked: payload.tracked.length,
      openSessions: Object.keys(payload.openSessionByTrackedId).length,
      partyGroups: payload.partyGroups.length,
      activeSessions: payload.activeRecentSessions.length,
    });

    return NextResponse.json(payload);
  } catch (error) {
    debugLog("dashboard-live", "error", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return toApiError(error);
  }
}
