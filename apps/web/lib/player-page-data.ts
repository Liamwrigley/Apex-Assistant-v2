import type { TProfileRangePayload } from "@/app/player/[trackedAccountId]/profile-range-context";
import type { TRecentSessionRow } from "@/components/recent-sessions-types";
import type { TPartyMatchSerialized } from "@/lib/party-matches";
import {
  clusterMatchesFromEdges,
  serializePartyMatches,
} from "@/lib/party-matches";
import { buildAllMatchesFromEdgesAndSegments } from "@/lib/party-matches-server";
import {
  buildGranularSnapshotsByAccount,
  buildTrackerObsByAccount,
  mapOpenSessionsToRecentSessionRows,
  mapSessionsToRecentSessionRows,
} from "@/lib/recent-session-rows";
import { buildTrackerRowsForProfile } from "@/lib/tracker-profile-rows";
import { getLegendIconUrl } from "@/lib/legend-icon-url";
import { resolveProfileDisplayLegendName } from "@/lib/profile-display-legend";
import { evaluateRealtimePresence } from "@/lib/realtime-presence";
import {
  getTrackedAccountById,
  getRankTimelineByTrackedAccountId,
  getRecentCompletedSessionsByAccount,
  getOpenSessionSummariesForTrackedAccountIds,
  getSegmentsBySessionIds,
  getLegendAggregatesByAccount,
  getMapAggregatesByAccount,
  getMapLegendAggregatesByAccount,
  getCareerStatDeltasForTrackedAccount,
  getLatestTrackerSnapshotForLegend,
  getTrackerStatDeltasForTrackedAccount,
  hasAnyTrackerObservations,
  getStackCompositions,
  getBaselineAvgRp,
  getBestStackByMap,
  getPartyMatchEdgesByAccount,
  getRecentGamesByTrackedAccountIds,
} from "@apex-assistant/db";

const RECENT_MATCH_GAMES_LIMIT = 240;

const HOUR_OPTIONS: Record<string, number> = {
  "24h": 24,
  "3d": 72,
  "7d": 168,
  "14d": 336,
  "30d": 720,
};

function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

export type TPlayerPageData = {
  account: {
    id: string;
    ign: string;
    platform: string;
    ownerUserId: string;
    currentLevel: number | null;
    currentRankName: string | null;
    currentRankDivision: string | null;
    careerKills: number | null;
    careerDamage: number | null;
    careerWins: number | null;
    lastCheckedAt: string | null;
    realtimeSelectedLegend: string | null;
    realtimeIsOnline: number | null;
    realtimeIsInGame: number | null;
    realtimeCanJoin: number | null;
    realtimeCurrentState: string | null;
    realtimeCurrentStateAsText: string | null;
    realtimeLobbyState: string | null;
    realtimeUpdatedAt: string | null;
  };
  initialRangePayload: TProfileRangePayload;
  openSession: {
    startedAt: string;
    openingRankScore: number | null;
    latestRankScore: number | null;
    openingRankName: string | null;
    openingRankDivision: string | null;
    latestRankName: string | null;
    latestRankDivision: string | null;
    legends: string[];
  } | null;
  recentSessionRows: TRecentSessionRow[];
  matches: TPartyMatchSerialized[];
};

/**
 * Loads all data the player profile page needs for its initial SSR render.
 * Returns `null` if the account doesn't exist.
 */
export async function loadPlayerPage(
  trackedAccountId: string,
): Promise<TPlayerPageData | null> {
  const rangeKey = "7d";
  const hours = HOUR_OPTIONS[rangeKey];

  const account = await getTrackedAccountById(trackedAccountId);
  if (!account) return null;

  const lastSeenLegendIconUrl = account.realtimeSelectedLegend
    ? getLegendIconUrl(account.realtimeSelectedLegend)
    : null;
  const presenceEval = evaluateRealtimePresence({
    realtimeUpdatedAt: account.realtimeUpdatedAt
      ? toIso(account.realtimeUpdatedAt)
      : null,
    realtimeIsOnline: account.realtimeIsOnline,
    realtimeIsInGame: account.realtimeIsInGame,
    realtimeCurrentState: account.realtimeCurrentState,
    realtimeCurrentStateAsText: account.realtimeCurrentStateAsText,
  });

  const [
    timelineRaw,
    recentSessions,
    openSessionSummaries,
    legendAggregates,
    mapAggregates,
    mapLegendAggregates,
    careerDeltas,
    trackerDeltas,
    hasTrackerObs,
    stackCompositions,
    baselineAvgRp,
    bestStackByMap,
    recentGamesByAccount,
  ] = await Promise.all([
    getRankTimelineByTrackedAccountId(trackedAccountId, hours),
    getRecentCompletedSessionsByAccount(trackedAccountId, 30),
    getOpenSessionSummariesForTrackedAccountIds([trackedAccountId]),
    getLegendAggregatesByAccount(trackedAccountId, hours),
    getMapAggregatesByAccount(trackedAccountId, hours),
    getMapLegendAggregatesByAccount(trackedAccountId, hours),
    getCareerStatDeltasForTrackedAccount(trackedAccountId, hours),
    getTrackerStatDeltasForTrackedAccount(trackedAccountId, hours),
    hasAnyTrackerObservations(trackedAccountId),
    getStackCompositions(trackedAccountId, hours),
    getBaselineAvgRp(trackedAccountId, hours),
    getBestStackByMap(trackedAccountId, hours),
    getRecentGamesByTrackedAccountIds(
      [trackedAccountId],
      RECENT_MATCH_GAMES_LIMIT,
    ),
  ]);

  const recentMatchGames = (recentGamesByAccount[trackedAccountId] ?? []).map(
    (cell) => ({
      ...cell,
      startedAt: toIso(cell.startedAt),
      endedAt: toIso(cell.endedAt),
    }),
  );

  const displayLegend = resolveProfileDisplayLegendName({
    isOnline: presenceEval.shouldShow,
    lastSeenLegendIconUrl,
    realtimeSelectedLegend: account.realtimeSelectedLegend,
    legendAggregates,
  });

  const trackerSnapshot = await getLatestTrackerSnapshotForLegend(
    trackedAccountId,
    displayLegend ?? "",
  );

  const timelinePoints = timelineRaw.map((p) => ({
    capturedAt: toIso(p.capturedAt),
    rankScore: p.rankScore,
  }));

  const trackerRows = buildTrackerRowsForProfile(
    trackerSnapshot,
    trackerDeltas,
    displayLegend,
  );

  const initialRangePayload: TProfileRangePayload = {
    rangeKey,
    timelinePoints,
    legendAggregates,
    mapAggregates,
    mapLegendAggregates,
    careerDeltas,
    trackerRows,
    selectedLegend: displayLegend,
    hasTrackerObservations: hasTrackerObs,
    legacyApiSummary: {
      kills: account.careerKills,
      damage: account.careerDamage,
      wins: account.careerWins,
    },
    stackCompositions,
    baselineAvgRp,
    bestStackByMap,
    recentMatchGames,
  };

  const openSessionRaw = openSessionSummaries[0] ?? null;

  const sessionIds = [
    ...new Set([
      ...recentSessions.map((r) => r.sessionId),
      ...openSessionSummaries.map((o) => o.sessionId),
    ]),
  ];

  const [segmentsBySession, granularSnapshotsByAccount, matchEdges] =
    await Promise.all([
      getSegmentsBySessionIds(sessionIds),
      buildGranularSnapshotsByAccount(recentSessions),
      getPartyMatchEdgesByAccount(trackedAccountId, 300),
    ]);

  const trackerObsByAccount = await buildTrackerObsByAccount(segmentsBySession);

  const completedSessionRows = mapSessionsToRecentSessionRows(
    recentSessions,
    segmentsBySession,
    granularSnapshotsByAccount,
    trackerObsByAccount,
  );
  const accountByTrackedId = new Map([
    [trackedAccountId, { ign: account.ign, platform: account.platform }],
  ]);
  const activeSessionRows = await mapOpenSessionsToRecentSessionRows(
    openSessionSummaries,
    accountByTrackedId,
    segmentsBySession,
    trackerObsByAccount,
  );
  const recentSessionRows = [...activeSessionRows, ...completedSessionRows];
  const allSegments = Object.values(segmentsBySession).flat();
  const ignByTrackedAccountId = new Map([
    [trackedAccountId, account.ign],
  ]);
  const matches = serializePartyMatches(
    buildAllMatchesFromEdgesAndSegments(
      matchEdges,
      allSegments,
      ignByTrackedAccountId,
    ),
  );

  return {
    account: {
      id: account.id,
      ign: account.ign,
      platform: account.platform,
      ownerUserId: account.ownerUserId,
      currentLevel: account.currentLevel ?? null,
      currentRankName: account.currentRankName ?? null,
      currentRankDivision: account.currentRankDivision ?? null,
      careerKills: account.careerKills ?? null,
      careerDamage: account.careerDamage ?? null,
      careerWins: account.careerWins ?? null,
      lastCheckedAt: account.lastCheckedAt ? toIso(account.lastCheckedAt) : null,
      realtimeSelectedLegend: account.realtimeSelectedLegend ?? null,
      realtimeIsOnline: account.realtimeIsOnline ?? null,
      realtimeIsInGame: account.realtimeIsInGame ?? null,
      realtimeCanJoin: account.realtimeCanJoin ?? null,
      realtimeCurrentState: account.realtimeCurrentState ?? null,
      realtimeCurrentStateAsText: account.realtimeCurrentStateAsText ?? null,
      realtimeLobbyState: account.realtimeLobbyState ?? null,
      realtimeUpdatedAt: account.realtimeUpdatedAt
        ? toIso(account.realtimeUpdatedAt)
        : null,
    },
    initialRangePayload,
    openSession: openSessionRaw
      ? {
          startedAt: toIso(openSessionRaw.startedAt),
          openingRankScore: openSessionRaw.openingRankScore,
          latestRankScore: openSessionRaw.latestRankScore,
          openingRankName: openSessionRaw.openingRankName,
          openingRankDivision: openSessionRaw.openingRankDivision,
          latestRankName: openSessionRaw.latestRankName,
          latestRankDivision: openSessionRaw.latestRankDivision,
          legends: openSessionRaw.legends,
        }
      : null,
    recentSessionRows,
    matches,
  };
}
