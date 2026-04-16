import { LeaderboardCard } from "@/components/leaderboard-card";
import { LivePresenceSection } from "@/components/live-presence-section";
import {
  RecentSessionsSection,
  type TRecentSessionRow,
} from "@/components/recent-sessions-section";
import { TrackedAccountsOwnerTable } from "@/components/tracked-accounts-owner-table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  clusterMatchesFromEdges,
  serializePartyMatches,
  type TPartyMatchSerialized,
} from "@/lib/party-matches";
import {
  buildGranularSnapshotsByAccount,
  buildTrackerObsByAccount,
  mapOpenSessionsToRecentSessionRows,
  mapSessionsToRecentSessionRows,
} from "@/lib/recent-session-rows";
import {
  getActivePartyGroups,
  getLeaderboardWithDelta24h,
  getOpenSegmentStartTimes,
  getOpenSessionSummariesForTrackedAccountIds,
  getPartyMatchEdges,
  getRankMovers24h,
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

type TTrackedRow = {
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

type TLeaderboardRow = {
  trackedAccountId: string;
  ign: string;
  platform: string;
  rankScore: number;
  rankName: string;
  rankDivision: string | null;
  deltaRp24h: number | null;
};

function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

type TStatsMover = {
  ign: string;
  platform: string;
  deltaRp: number;
  rankName: string | null;
  rankDivision: string | null;
  rankScore: number | null;
};

async function loadDashboardFromDb(guildFilter: string | undefined): Promise<{
  leaderboard: TLeaderboardRow[];
  tracked: TTrackedRow[];
  timelines: Record<string, Array<{ capturedAt: string; rankScore: number }>>;
  stats24h: {
    highestGainer: TStatsMover | null;
    biggestLoser: TStatsMover | null;
  };
  partyGroups: string[][];
  openSessionByTrackedId: Record<
    string,
    {
      startedAt: string;
      openingRankScore: number | null;
      latestRankScore: number | null;
      openingRankName: string | null;
      openingRankDivision: string | null;
      latestRankName: string | null;
      latestRankDivision: string | null;
      legends: string[];
      gameStartedAt: string | null;
    }
  >;
  recentSessions: TRecentSessionRow[];
  partyMatches: TPartyMatchSerialized[];
}> {
  const [
    leaderboardRows,
    trackedAccounts,
    stats24h,
    recentSessionsRaw,
    matchEdges,
  ] = await Promise.all([
    getLeaderboardWithDelta24h(guildFilter),
    listTrackedAccounts(guildFilter),
    getRankMovers24h(guildFilter),
    getRecentCompletedSessions(200),
    getPartyMatchEdges(300),
  ]);

  const leaderboard = [...leaderboardRows]
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

  const trackedIds = leaderboard.map((r) => r.trackedAccountId);

  const tracked: TTrackedRow[] = trackedAccounts.map((row) => ({
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

  const allTrackedAccountIds = trackedAccounts.map((r) => r.id);
  const recentSessionAccountIds = [
    ...new Set(recentSessionsRaw.map((r) => r.trackedAccountId)),
  ];
  const timelineAccountIds = [
    ...new Set([...trackedIds, ...recentSessionAccountIds]),
  ];

  const [
    openSessionSummaries,
    timelinesRaw,
    granularSnapshotsByAccount,
    partyGroups,
    openSegmentStarts,
  ] = await Promise.all([
    getOpenSessionSummariesForTrackedAccountIds(allTrackedAccountIds),
    getRankTimelinesByTrackedAccountIds(timelineAccountIds, 168),
    buildGranularSnapshotsByAccount(recentSessionsRaw),
    getActivePartyGroups(allTrackedAccountIds),
    getOpenSegmentStartTimes(allTrackedAccountIds),
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

  const openSessionByTrackedId: Record<
    string,
    {
      startedAt: string;
      openingRankScore: number | null;
      latestRankScore: number | null;
      openingRankName: string | null;
      openingRankDivision: string | null;
      latestRankName: string | null;
      latestRankDivision: string | null;
      legends: string[];
      gameStartedAt: string | null;
    }
  > = {};
  const selectedLegendByAccountId = new Map(
    trackedAccounts.map((a) => [a.id, a.realtimeSelectedLegend ?? null]),
  );
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

  const sessionIds = [
    ...new Set([
      ...recentSessionsRaw.map((r) => r.sessionId),
      ...openSessionSummaries.map((o) => o.sessionId),
    ]),
  ];
  const segmentsBySession = await getSegmentsBySessionIds(sessionIds);

  const trackerObsByAccount = await buildTrackerObsByAccount(segmentsBySession);

  const completedRecentSessions = mapSessionsToRecentSessionRows(
    recentSessionsRaw,
    segmentsBySession,
    granularSnapshotsByAccount,
    trackerObsByAccount,
  );
  const accountByTrackedId = new Map(
    trackedAccounts.map((a) => [a.id, { ign: a.ign, platform: a.platform }]),
  );
  const activeRecentSessions = await mapOpenSessionsToRecentSessionRows(
    openSessionSummaries,
    accountByTrackedId,
    segmentsBySession,
    trackerObsByAccount,
  );
  const recentSessions = [...activeRecentSessions, ...completedRecentSessions];

  pageLog("dashboard db load", {
    guildFilter: guildFilter ?? null,
    leaderboardCount: leaderboard.length,
    trackedCount: tracked.length,
  });

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

  const partyMatches = serializePartyMatches(
    clusterMatchesFromEdges(matchEdges),
  );

  return {
    leaderboard,
    tracked,
    timelines,
    stats24h: stats24hDisplay,
    partyGroups,
    openSessionByTrackedId,
    recentSessions,
    partyMatches,
  };
}

export default async function HomePage() {
  const guildId = process.env.DISCORD_GUILD_ID ?? "";
  const guildFilter = guildId.length > 0 ? guildId : undefined;
  pageLog("render start", {
    guildId,
    guildFilter: guildFilter ?? "all guilds",
  });
  const {
    leaderboard,
    tracked,
    timelines,
    stats24h,
    partyGroups,
    openSessionByTrackedId,
    recentSessions,
    partyMatches,
  } = await loadDashboardFromDb(guildFilter);
  const top = leaderboard[0] ?? null;
  const trackedByOwner = tracked.reduce(
    (acc, row) => {
      const ownerKey = row.ownerDisplayName ?? row.ownerUserId;
      if (!acc[ownerKey]) {
        acc[ownerKey] = [];
      }
      acc[ownerKey].push(row);
      return acc;
    },
    {} as Record<string, TTrackedRow[]>,
  );

  const presenceInitialData = {
    tracked: tracked.map((row) => ({
      id: row.id,
      identityGroupId: row.identityGroupId,
      ign: row.ign,
      platform: row.platform,
      ownerUserId: row.ownerUserId,
      currentLevel: row.currentLevel,
      realtimeSelectedLegend: row.realtimeSelectedLegend,
      realtimeIsOnline: row.realtimeIsOnline,
      realtimeIsInGame: row.realtimeIsInGame,
      realtimeCanJoin: row.realtimeCanJoin,
      realtimeCurrentState: row.realtimeCurrentState,
      realtimeCurrentStateAsText: row.realtimeCurrentStateAsText,
      realtimeLobbyState: row.realtimeLobbyState,
      realtimeUpdatedAt: row.realtimeUpdatedAt,
      currentRankName: row.currentRankName,
      currentRankDivision: row.currentRankDivision,
    })),
    openSessionByTrackedId,
    partyGroups,
  };

  const averageRp =
    leaderboard.length === 0
      ? 0
      : Math.round(
          leaderboard.reduce((sum, row) => sum + row.rankScore, 0) /
            leaderboard.length,
        );
  pageLog("render data summary", {
    leaderboardCount: leaderboard.length,
    trackedCount: tracked.length,
    hasTimelines: Object.keys(timelines).length > 0,
  });

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <section className="grid gap-3 md:grid-cols-5">
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardHeader className="space-y-1 p-2.5">
            <div className="bg-emerald-500/15 text-emerald-300 inline-flex h-5 w-5 items-center justify-center rounded-sm">
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden
                className="h-3 w-3"
              >
                <path d="M10 2a4 4 0 100 8 4 4 0 000-8zM3 16a7 7 0 1114 0v1H3v-1z" />
              </svg>
            </div>
            <CardDescription className="text-[11px] leading-none">
              Tracked Players
            </CardDescription>
            <div className="min-w-0 space-y-0.5">
              <CardTitle className="text-lg font-semibold tabular-nums leading-tight">
                {tracked.length}
              </CardTitle>
              <p className="text-muted-foreground min-h-[1rem] text-xs leading-tight">
                {"\u00a0"}
              </p>
            </div>
          </CardHeader>
        </Card>
        <Card className="border-cyan-500/20 bg-cyan-500/5">
          <CardHeader className="space-y-1 p-2.5">
            <div className="bg-cyan-500/15 text-cyan-300 inline-flex h-5 w-5 items-center justify-center rounded-sm">
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden
                className="h-3 w-3"
              >
                <path d="M4 15h2V8H4v7zm5 0h2V3H9v12zm5 0h2v-5h-2v5z" />
              </svg>
            </div>
            <CardDescription className="text-[11px] leading-none">
              Average RP
            </CardDescription>
            <div className="min-w-0 space-y-0.5">
              <CardTitle className="text-lg font-semibold tabular-nums leading-tight">
                {averageRp.toLocaleString()}
              </CardTitle>
              <p className="text-muted-foreground min-h-[1rem] text-xs leading-tight">
                {"\u00a0"}
              </p>
            </div>
          </CardHeader>
        </Card>
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardHeader className="space-y-1 p-2.5">
            <div className="bg-amber-500/15 text-amber-300 inline-flex h-5 w-5 items-center justify-center rounded-sm">
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden
                className="h-3 w-3"
              >
                <path d="M5 3h10v2h1a1 1 0 011 1v2a4 4 0 01-4 4h-1.1A4 4 0 0111 13v2h2v2H7v-2h2v-2a4 4 0 01-.9-2H7a4 4 0 01-4-4V6a1 1 0 011-1h1V3zM5 7H4v1a2 2 0 002 2h1V7zm10 0h1v1a2 2 0 01-2 2h-1V7z" />
              </svg>
            </div>
            <CardDescription className="text-[11px] leading-none">
              Top Player
            </CardDescription>
            <div className="min-w-0 space-y-0.5">
              <CardTitle className="truncate text-lg font-semibold leading-tight">
                {top ? top.ign : "—"}
              </CardTitle>
              <p className="text-muted-foreground min-h-[1rem] truncate text-xs leading-tight">
                {top ? `${top.rankScore.toLocaleString()} RP` : "\u00a0"}
              </p>
            </div>
          </CardHeader>
        </Card>
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardHeader className="space-y-1 p-2.5">
            <div className="bg-emerald-500/15 text-emerald-300 inline-flex h-5 w-5 items-center justify-center rounded-sm">
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden
                className="h-3 w-3"
              >
                <path d="M10 3l5 6h-3v8H8V9H5l5-6z" />
              </svg>
            </div>
            <CardDescription className="text-[11px] leading-none">
              Highest Gainer (24h)
            </CardDescription>
            <div className="min-w-0 space-y-0.5">
              <CardTitle className="truncate text-lg font-semibold leading-tight">
                {stats24h.highestGainer ? stats24h.highestGainer.ign : "—"}
              </CardTitle>
              <p className="text-muted-foreground min-h-[1rem] truncate text-xs leading-tight">
                {stats24h.highestGainer
                  ? `+${stats24h.highestGainer.deltaRp.toLocaleString()} RP`
                  : "\u00a0"}
              </p>
            </div>
          </CardHeader>
        </Card>
        <Card className="border-rose-500/20 bg-rose-500/5">
          <CardHeader className="space-y-1 p-2.5">
            <div className="bg-rose-500/15 text-rose-300 inline-flex h-5 w-5 items-center justify-center rounded-sm">
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden
                className="h-3 w-3"
              >
                <path d="M10 17l-5-6h3V3h4v8h3l-5 6z" />
              </svg>
            </div>
            <CardDescription className="text-[11px] leading-none">
              Biggest Loser (24h)
            </CardDescription>
            <div className="min-w-0 space-y-0.5">
              <CardTitle className="truncate text-lg font-semibold leading-tight">
                {stats24h.biggestLoser ? stats24h.biggestLoser.ign : "—"}
              </CardTitle>
              <p className="text-muted-foreground min-h-[1rem] truncate text-xs leading-tight">
                {stats24h.biggestLoser
                  ? `${stats24h.biggestLoser.deltaRp.toLocaleString()} RP`
                  : "\u00a0"}
              </p>
            </div>
          </CardHeader>
        </Card>
      </section>

      <LeaderboardCard
        rows={leaderboard}
        timelines={timelines}
        trackedCount={tracked.length}
      />

      <LivePresenceSection
        initialData={presenceInitialData}
        guildId={guildFilter}
      />

      <RecentSessionsSection
        rows={recentSessions}
        partyMatches={partyMatches}
      />

      <Card>
        <CardHeader>
          <CardTitle>Tracked Accounts</CardTitle>
          <CardDescription>
            Grouped by owner with tracking and sync timestamps.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tracked.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No tracked accounts yet.
            </p>
          ) : (
            <div className="space-y-4">
              {Object.entries(trackedByOwner).map(([ownerName, accounts]) => (
                <TrackedAccountsOwnerTable
                  key={ownerName}
                  ownerName={ownerName}
                  accounts={accounts}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
