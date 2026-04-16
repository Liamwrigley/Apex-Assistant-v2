import {
  listTrackedAccounts,
  getOpenSessionSummariesForTrackedAccountIds,
  getActivePartyGroups,
  getOpenSegmentStartTimes,
} from "@apex-assistant/db";
import { NextResponse } from "next/server";
import { debugLog } from "@/app/api/_lib/log";
import { toApiError } from "@/app/api/_lib/responses";

function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const guildId = url.searchParams.get("guildId");
    debugLog("presence", "request", { guildId: guildId ?? null });

    const trackedAccounts = await listTrackedAccounts(guildId ?? undefined);
    const allIds = trackedAccounts.map((r) => r.id);

    const [openSummaries, partyGroups, openSegmentStarts] = await Promise.all([
      getOpenSessionSummariesForTrackedAccountIds(allIds),
      getActivePartyGroups(allIds),
      getOpenSegmentStartTimes(allIds),
    ]);

    const tracked = trackedAccounts.map((row) => ({
      id: row.id,
      identityGroupId: row.identityGroupId ?? null,
      ign: row.ign,
      platform: row.platform,
      ownerUserId: row.ownerUserId,
      ownerDisplayName: row.ownerDisplayName ?? null,
      currentLevel: row.currentLevel ?? null,
      realtimeLobbyState: row.realtimeLobbyState ?? null,
      realtimeIsOnline: row.realtimeIsOnline ?? null,
      realtimeIsInGame: row.realtimeIsInGame ?? null,
      realtimeCanJoin: row.realtimeCanJoin ?? null,
      realtimeSelectedLegend: row.realtimeSelectedLegend ?? null,
      realtimeCurrentState: row.realtimeCurrentState ?? null,
      realtimeCurrentStateAsText: row.realtimeCurrentStateAsText ?? null,
      realtimeUpdatedAt: row.realtimeUpdatedAt
        ? toIso(row.realtimeUpdatedAt)
        : null,
      currentRankName: row.currentRankName ?? null,
      currentRankDivision: row.currentRankDivision ?? null,
    }));

    const selectedLegendByAccountId = new Map(
      trackedAccounts.map((a) => [a.id, a.realtimeSelectedLegend ?? null]),
    );

    const openSessionByTrackedId: Record<string, {
      startedAt: string;
      openingRankScore: number | null;
      latestRankScore: number | null;
      openingRankName: string | null;
      openingRankDivision: string | null;
      latestRankName: string | null;
      latestRankDivision: string | null;
      legends: string[];
      gameStartedAt: string | null;
    }> = {};

    for (const s of openSummaries) {
      const currentLegend = selectedLegendByAccountId.get(s.trackedAccountId);
      const legends =
        currentLegend && !s.legends.includes(currentLegend)
          ? [...s.legends, currentLegend]
          : s.legends;
      const segStart = openSegmentStarts[s.trackedAccountId];
      openSessionByTrackedId[s.trackedAccountId] = {
        startedAt: toIso(s.startedAt),
        openingRankScore: s.openingRankScore,
        latestRankScore: s.latestRankScore,
        openingRankName: s.openingRankName,
        openingRankDivision: s.openingRankDivision,
        latestRankName: s.latestRankName,
        latestRankDivision: s.latestRankDivision,
        legends,
        gameStartedAt: segStart ? toIso(segStart) : null,
      };
    }

    debugLog("presence", "loaded", {
      tracked: tracked.length,
      openSessions: openSummaries.length,
      partyGroups: partyGroups.length,
    });

    return NextResponse.json(
      { tracked, openSessionByTrackedId, partyGroups },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      },
    );
  } catch (error) {
    debugLog("presence", "error", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return toApiError(error);
  }
}
