import { DashboardClient } from "@/components/dashboard-client";
import type { TRecentSessionRow } from "@/components/recent-sessions-section";
import { computeDashboardLive } from "@/lib/dashboard-live";
import {
  clusterMatchesFromEdges,
  serializePartyMatches,
  type TPartyMatchSerialized,
} from "@/lib/party-matches";
import {
  buildGranularSnapshotsByAccount,
  buildTrackerObsByAccount,
  mapSessionsToRecentSessionRows,
} from "@/lib/recent-session-rows";
import {
  getPartyMatchEdges,
  getRankTimelinesByTrackedAccountIds,
  getRecentCompletedSessions,
  getSegmentsBySessionIds,
  listTrackedAccounts,
} from "@apex-assistant/db";

export const revalidate = 60;
const debugLogs = (process.env.DEBUG_LOGS ?? "false").toLowerCase() === "true";

function pageLog(message: string, meta?: Record<string, unknown>) {
  if (!debugLogs) {
    return;
  }
  const payload = meta ? ` ${JSON.stringify(meta)}` : "";
  console.log(`[web:page] ${message}${payload}`);
}

type TTrackedOwnerRow = {
  id: string;
  identityGroupId: string | null;
  ign: string;
  platform: string;
  ownerUserId: string;
  ownerDisplayName?: string | null;
  externalPlayerId: string | null;
  createdAt: string;
  lastCheckedAt: string | null;
  currentLevel: number | null;
  realtimeLobbyState: string | null;
  realtimeIsOnline: number | null;
  realtimeIsInGame: number | null;
  realtimeCanJoin: number | null;
  realtimePartyFull: number | null;
  realtimeSelectedLegend: string | null;
  realtimeCurrentState: string | null;
  realtimeCurrentStateAsText: string | null;
  realtimeCurrentStateSinceTimestamp: number | null;
  realtimeUpdatedAt: string | null;
  currentRankName: string | null;
  currentRankDivision: string | null;
};

function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

/**
 * Loads slow-moving dashboard data (things that only need to refresh on ISR
 * revalidation, not on every client poll): 168h rank timelines, completed
 * sessions, party match edges, and the tracked-accounts-by-owner table.
 *
 * Frequently-changing data (leaderboard, presence, open sessions, active
 * session rows, 24h movers) is fetched by `computeDashboardLive` so it shares
 * one consistent DB snapshot with the client-side live poll.
 */
async function loadDashboardStatic(guildFilter: string | undefined): Promise<{
  timelines: Record<string, Array<{ capturedAt: string; rankScore: number }>>;
  partyMatches: TPartyMatchSerialized[];
  completedRecentSessions: TRecentSessionRow[];
  trackedByOwner: Record<string, TTrackedOwnerRow[]>;
}> {
  const [trackedAccounts, recentSessionsRaw, matchEdges] = await Promise.all([
    listTrackedAccounts(guildFilter),
    getRecentCompletedSessions(200),
    getPartyMatchEdges(300),
  ]);

  const allTrackedAccountIds = trackedAccounts.map((r) => r.id);
  const recentSessionAccountIds = [
    ...new Set(recentSessionsRaw.map((r) => r.trackedAccountId)),
  ];
  const timelineAccountIds = [
    ...new Set([...allTrackedAccountIds, ...recentSessionAccountIds]),
  ];

  const [timelinesRaw, granularSnapshotsByAccount] = await Promise.all([
    getRankTimelinesByTrackedAccountIds(timelineAccountIds, 168),
    buildGranularSnapshotsByAccount(recentSessionsRaw),
  ]);

  const timelines: Record<
    string,
    Array<{ capturedAt: string; rankScore: number }>
  > = {};
  for (const [tid, pts] of Object.entries(timelinesRaw)) {
    timelines[tid] = pts.map((p) => ({
      capturedAt: toIso(p.capturedAt),
      rankScore: p.rankScore,
    }));
  }

  const sessionIds = [...new Set(recentSessionsRaw.map((r) => r.sessionId))];
  const segmentsBySession = await getSegmentsBySessionIds(sessionIds);
  const trackerObsByAccount = await buildTrackerObsByAccount(segmentsBySession);

  const completedRecentSessions = mapSessionsToRecentSessionRows(
    recentSessionsRaw,
    segmentsBySession,
    granularSnapshotsByAccount,
    trackerObsByAccount,
  );

  const partyMatches = serializePartyMatches(
    clusterMatchesFromEdges(matchEdges),
  );

  const tracked: TTrackedOwnerRow[] = trackedAccounts.map((row) => ({
    id: row.id,
    identityGroupId: row.identityGroupId ?? null,
    ign: row.ign,
    platform: row.platform,
    ownerUserId: row.ownerUserId,
    ownerDisplayName: row.ownerDisplayName ?? null,
    externalPlayerId: row.externalPlayerId,
    createdAt: toIso(row.createdAt),
    lastCheckedAt: row.lastCheckedAt ? toIso(row.lastCheckedAt) : null,
    currentLevel: row.currentLevel ?? null,
    realtimeLobbyState: row.realtimeLobbyState ?? null,
    realtimeIsOnline: row.realtimeIsOnline ?? null,
    realtimeIsInGame: row.realtimeIsInGame ?? null,
    realtimeCanJoin: row.realtimeCanJoin ?? null,
    realtimePartyFull: row.realtimePartyFull ?? null,
    realtimeSelectedLegend: row.realtimeSelectedLegend ?? null,
    realtimeCurrentState: row.realtimeCurrentState ?? null,
    realtimeCurrentStateAsText: row.realtimeCurrentStateAsText ?? null,
    realtimeCurrentStateSinceTimestamp:
      row.realtimeCurrentStateSinceTimestamp ?? null,
    realtimeUpdatedAt: row.realtimeUpdatedAt
      ? toIso(row.realtimeUpdatedAt)
      : null,
    currentRankName: row.currentRankName ?? null,
    currentRankDivision: row.currentRankDivision ?? null,
  }));

  const trackedByOwner = tracked.reduce(
    (acc, row) => {
      const ownerKey = row.ownerDisplayName ?? row.ownerUserId;
      if (!acc[ownerKey]) {
        acc[ownerKey] = [];
      }
      acc[ownerKey].push(row);
      return acc;
    },
    {} as Record<string, TTrackedOwnerRow[]>,
  );

  return { timelines, partyMatches, completedRecentSessions, trackedByOwner };
}

export default async function HomePage() {
  const guildId = process.env.DISCORD_GUILD_ID ?? "";
  const guildFilter = guildId.length > 0 ? guildId : undefined;
  pageLog("render start", {
    guildId,
    guildFilter: guildFilter ?? "all guilds",
  });

  const [initialLive, staticData] = await Promise.all([
    computeDashboardLive(guildFilter),
    loadDashboardStatic(guildFilter),
  ]);

  pageLog("render data summary", {
    leaderboardCount: initialLive.leaderboard.length,
    trackedCount: initialLive.tracked.length,
    hasTimelines: Object.keys(staticData.timelines).length > 0,
  });

  return (
    <DashboardClient
      guildId={guildFilter}
      initialLive={initialLive}
      timelines={staticData.timelines}
      partyMatches={staticData.partyMatches}
      completedRecentSessions={staticData.completedRecentSessions}
      trackedByOwner={staticData.trackedByOwner}
    />
  );
}
