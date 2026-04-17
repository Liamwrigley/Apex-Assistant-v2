import {
  getActivePartyGroups,
  getLeaderboardWithDelta24h,
  getOpenSegmentStartTimes,
  getOpenSessionSummariesForTrackedAccountIds,
  getRankMovers24h,
  getSegmentsBySessionIds,
  listTrackedAccounts,
} from "@apex-assistant/db";
import type {
  TLivePresenceCardRow,
  TLivePresenceSessionProps,
} from "@/components/live-presence-card";
import type { TRecentSessionRow } from "@/components/recent-sessions-types";
import {
  buildTrackerObsByAccount,
  mapOpenSessionsToRecentSessionRows,
} from "@/lib/recent-session-rows";

export type TDashboardLiveLeaderboardRow = {
  trackedAccountId: string;
  ign: string;
  platform: string;
  rankScore: number;
  rankName: string;
  rankDivision: string | null;
  deltaRp24h: number | null;
};

export type TDashboardLiveStatsMover = {
  ign: string;
  platform: string;
  deltaRp: number;
  rankName: string | null;
  rankDivision: string | null;
  rankScore: number | null;
};

export type TDashboardLivePresenceRow = TLivePresenceCardRow & {
  identityGroupId: string | null;
  ownerUserId: string;
};

export type TDashboardLiveOpenSession = NonNullable<TLivePresenceSessionProps>;

export type TDashboardLivePayload = {
  generatedAt: string;
  leaderboard: TDashboardLiveLeaderboardRow[];
  stats24h: {
    highestGainer: TDashboardLiveStatsMover | null;
    biggestLoser: TDashboardLiveStatsMover | null;
  };
  tracked: TDashboardLivePresenceRow[];
  openSessionByTrackedId: Record<string, TDashboardLiveOpenSession>;
  partyGroups: string[][];
  activeRecentSessions: TRecentSessionRow[];
};

function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

/**
 * Computes all frequently-changing dashboard data in a single, consistent DB
 * pass. Used by both the SSR page (for first paint / `initialData`) and the
 * `/api/dashboard-live` endpoint so the two always produce the same shape.
 *
 * Intentionally excludes slow-moving data (168h rank timelines, completed
 * sessions, party match history, tracked-accounts metadata groupings) — those
 * stay on the ISR-cached server page because they barely change between polls
 * and are expensive to recompute.
 */
export async function computeDashboardLive(
  guildFilter: string | undefined,
): Promise<TDashboardLivePayload> {
  const [leaderboardRows, trackedAccounts, stats24h] = await Promise.all([
    getLeaderboardWithDelta24h(guildFilter),
    listTrackedAccounts(guildFilter),
    getRankMovers24h(guildFilter),
  ]);

  const leaderboard: TDashboardLiveLeaderboardRow[] = [...leaderboardRows]
    .sort((a, b) => b.rankScore - a.rankScore)
    .map((r) => ({
      trackedAccountId: r.trackedAccountId,
      ign: r.ign,
      platform: r.platform,
      rankScore: r.rankScore,
      rankName: r.rankName,
      rankDivision: r.rankDivision ?? null,
      deltaRp24h: r.deltaRp24h,
    }));

  const tracked: TDashboardLivePresenceRow[] = trackedAccounts.map((row) => ({
    id: row.id,
    identityGroupId: row.identityGroupId ?? null,
    ign: row.ign,
    platform: row.platform,
    ownerUserId: row.ownerUserId,
    currentLevel: row.currentLevel ?? null,
    realtimeSelectedLegend: row.realtimeSelectedLegend ?? null,
    realtimeIsOnline: row.realtimeIsOnline ?? null,
    realtimeIsInGame: row.realtimeIsInGame ?? null,
    realtimeCanJoin: row.realtimeCanJoin ?? null,
    realtimeCurrentState: row.realtimeCurrentState ?? null,
    realtimeCurrentStateAsText: row.realtimeCurrentStateAsText ?? null,
    realtimeLobbyState: row.realtimeLobbyState ?? null,
    realtimeUpdatedAt: row.realtimeUpdatedAt ? toIso(row.realtimeUpdatedAt) : null,
    currentRankName: row.currentRankName ?? null,
    currentRankDivision: row.currentRankDivision ?? null,
  }));

  const allTrackedAccountIds = trackedAccounts.map((r) => r.id);

  const [openSessionSummaries, partyGroups, openSegmentStarts] =
    await Promise.all([
      getOpenSessionSummariesForTrackedAccountIds(allTrackedAccountIds),
      getActivePartyGroups(allTrackedAccountIds),
      getOpenSegmentStartTimes(allTrackedAccountIds),
    ]);

  const selectedLegendByAccountId = new Map(
    trackedAccounts.map((a) => [a.id, a.realtimeSelectedLegend ?? null]),
  );

  const openSessionByTrackedId: Record<string, TDashboardLiveOpenSession> = {};
  for (const s of openSessionSummaries) {
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

  const openSessionIds = openSessionSummaries.map((o) => o.sessionId);
  const segmentsBySession = await getSegmentsBySessionIds(openSessionIds);
  const trackerObsByAccount = await buildTrackerObsByAccount(segmentsBySession);

  const accountByTrackedId = new Map(
    trackedAccounts.map((a) => [a.id, { ign: a.ign, platform: a.platform }]),
  );
  const activeRecentSessions = await mapOpenSessionsToRecentSessionRows(
    openSessionSummaries,
    accountByTrackedId,
    segmentsBySession,
    trackerObsByAccount,
  );

  const lbByKey = new Map(
    leaderboard.map((r) => [`${r.ign}\0${r.platform}`, r]),
  );
  function rankExtras(ign: string, platform: string) {
    const row = lbByKey.get(`${ign}\0${platform}`);
    return {
      rankName: row?.rankName ?? null,
      rankDivision: row?.rankDivision ?? null,
      rankScore: row?.rankScore ?? null,
    };
  }

  const stats24hDisplay = {
    highestGainer: stats24h.highestGainer
      ? {
          ign: stats24h.highestGainer.ign,
          platform: stats24h.highestGainer.platform,
          deltaRp: stats24h.highestGainer.deltaRp,
          ...rankExtras(
            stats24h.highestGainer.ign,
            stats24h.highestGainer.platform,
          ),
        }
      : null,
    biggestLoser: stats24h.biggestLoser
      ? {
          ign: stats24h.biggestLoser.ign,
          platform: stats24h.biggestLoser.platform,
          deltaRp: stats24h.biggestLoser.deltaRp,
          ...rankExtras(
            stats24h.biggestLoser.ign,
            stats24h.biggestLoser.platform,
          ),
        }
      : null,
  };

  return {
    generatedAt: new Date().toISOString(),
    leaderboard,
    stats24h: stats24hDisplay,
    tracked,
    openSessionByTrackedId,
    partyGroups,
    activeRecentSessions,
  };
}
