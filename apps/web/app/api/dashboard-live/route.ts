import { NextResponse } from "next/server";
import { debugLog } from "@/app/api/_lib/log";
import { toApiError } from "@/app/api/_lib/responses";
import { computeDashboardLive } from "@/lib/dashboard-live";

/**
 * Unified live dashboard endpoint. Returns all frequently-changing cards
 * (leaderboard, 24h movers, presence, open sessions, party groups, active
 * session rows) in a single DB snapshot.
 *
 * Caching strategy (two-layer):
 * - `max-age=0, must-revalidate` — browsers never serve a stale copy. Every
 *   client poll re-asks the network, so users don't see ghost data until
 *   they hard-refresh.
 * - `s-maxage=15, stale-while-revalidate=30` — shared caches (CDN/edge) can
 *   still coalesce concurrent requests from many browsers into one DB hit
 *   per ~15s per `guildId`, with up to 30s of background-revalidating stale
 *   serves. This keeps DB load predictable even with many open tabs.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const guildId = url.searchParams.get("guildId");
    debugLog("dashboard-live", "request", { guildId: guildId ?? null });

    const payload = await computeDashboardLive(guildId ?? undefined);

    debugLog("dashboard-live", "loaded", {
      leaderboard: payload.leaderboard.length,
      tracked: payload.tracked.length,
      openSessions: Object.keys(payload.openSessionByTrackedId).length,
      partyGroups: payload.partyGroups.length,
      activeSessions: payload.activeRecentSessions.length,
    });

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control":
          "public, max-age=0, must-revalidate, s-maxage=15, stale-while-revalidate=30",
      },
    });
  } catch (error) {
    debugLog("dashboard-live", "error", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return toApiError(error);
  }
}
