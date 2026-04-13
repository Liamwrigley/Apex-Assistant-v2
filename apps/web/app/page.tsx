import { AutoRefresh } from "@/components/auto-refresh";
import { LeaderboardCard } from "@/components/leaderboard-card";
import { LivePresenceCard } from "@/components/live-presence-card";
import { RecentSessionsSection, type TRecentSessionRow } from "@/components/recent-sessions-section";
import { TrackedAccountsOwnerTable } from "@/components/tracked-accounts-owner-table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { evaluateRealtimePresence } from "@/lib/realtime-presence";
import { getTeamIdentity } from "@/lib/team-name";
import { cn } from "@/lib/utils";
import {
  buildGranularSnapshotsByAccount,
  buildTrackerObsByAccount,
  mapOpenSessionsToRecentSessionRows,
  mapSessionsToRecentSessionRows,
} from "@/lib/recent-session-rows";
import { clusterMatchesFromEdges, serializePartyMatches, type TPartyMatchSerialized } from "@/lib/party-matches";

export const dynamic = "force-dynamic";
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

/** One live-presence card per linked crossplay identity; solo rows use their own id. */
function presenceDedupeKey(row: TTrackedRow): string {
  if (row.identityGroupId) {
    return `gid:${row.identityGroupId}`;
  }
  // Fallback dedupe for pre-linked rows: same owner + normalized IGN.
  return `owner:${row.ownerUserId}\0ign:${row.ign.trim().toLowerCase()}`;
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
  const [leaderboardRows, trackedAccounts, stats24h, recentSessionsRaw, matchEdges] = await Promise.all([
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
  const recentSessionAccountIds = [...new Set(recentSessionsRaw.map((r) => r.trackedAccountId))];
  const timelineAccountIds = [...new Set([...trackedIds, ...recentSessionAccountIds])];

  const [openSessionSummaries, timelinesRaw, granularSnapshotsByAccount, partyGroups, openSegmentStarts] = await Promise.all([
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
    trackedAccounts.map((a) => [a.id, a.realtimeSelectedLegend ?? null])
  );
  for (const s of openSessionSummaries) {
    const currentLegend = selectedLegendByAccountId.get(s.trackedAccountId);
    const legends = currentLegend && !s.legends.includes(currentLegend)
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
    trackerObsByAccount
  );
  const accountByTrackedId = new Map(
    trackedAccounts.map((a) => [a.id, { ign: a.ign, platform: a.platform }])
  );
  const activeRecentSessions = await mapOpenSessionsToRecentSessionRows(
    openSessionSummaries,
    accountByTrackedId,
    segmentsBySession,
    trackerObsByAccount
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

  const partyMatches = serializePartyMatches(clusterMatchesFromEdges(matchEdges));

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
  const nowMs = Date.now();
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
  const seenPresenceGroups = new Set<string>();
  const informativeRealtimeRows = tracked
    .filter((row) => {
      const evaluation = evaluateRealtimePresence({
        realtimeUpdatedAt: row.realtimeUpdatedAt,
        realtimeIsOnline: row.realtimeIsOnline,
        realtimeIsInGame: row.realtimeIsInGame,
        realtimeCurrentState: row.realtimeCurrentState,
        realtimeCurrentStateAsText: row.realtimeCurrentStateAsText,
      });
      return evaluation.shouldShow;
    })
    .sort((a, b) => {
      const aGame = a.realtimeIsInGame === 1 ? 1 : 0;
      const bGame = b.realtimeIsInGame === 1 ? 1 : 0;
      if (aGame !== bGame) {
        return bGame - aGame;
      }
      const aOnline = a.realtimeIsOnline === 1 ? 1 : 0;
      const bOnline = b.realtimeIsOnline === 1 ? 1 : 0;
      if (aOnline !== bOnline) {
        return bOnline - aOnline;
      }
      const aTs = a.realtimeUpdatedAt
        ? new Date(a.realtimeUpdatedAt).getTime()
        : 0;
      const bTs = b.realtimeUpdatedAt
        ? new Date(b.realtimeUpdatedAt).getTime()
        : 0;
      if (aTs !== bTs) {
        return bTs - aTs;
      }
      return a.ign.localeCompare(b.ign);
    })
    .filter((row) => {
      const key = presenceDedupeKey(row);
      if (seenPresenceGroups.has(key)) {
        return false;
      }
      seenPresenceGroups.add(key);
      return true;
    });

  // Build grouped + solo presence lists
  const liveIdSet = new Set(informativeRealtimeRows.map((r) => r.id));
  const livePartyGroups = partyGroups
    .map((group) => group.filter((id) => liveIdSet.has(id)))
    .filter((group) => group.length >= 2);
  const groupedIds = new Set(livePartyGroups.flat());
  const soloRows = informativeRealtimeRows.filter((r) => !groupedIds.has(r.id));
  const rowById = new Map(informativeRealtimeRows.map((r) => [r.id, r]));
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
      <AutoRefresh intervalMs={60_000} />

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
            <CardDescription className="text-[11px] leading-none">Top Player</CardDescription>
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

      {informativeRealtimeRows.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Live Presence</CardTitle>
            <CardDescription>
              Realtime activity and the current online session.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {livePartyGroups.map((groupIds) => {
              const team = getTeamIdentity(groupIds);
              const members = groupIds
                .map((id) => rowById.get(id))
                .filter(Boolean) as TTrackedRow[];
              return (
                <div key={groupIds.join(",")} className="space-y-2">
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-1.5",
                      team.color.bg,
                      team.color.border,
                      "border"
                    )}
                  >
                    <span
                      className={cn("h-2 w-2 rounded-full", team.color.dot)}
                      aria-hidden
                    />
                    <span
                      className={cn(
                        "text-xs font-semibold tracking-wide uppercase",
                        team.color.text
                      )}
                    >
                      {team.name}
                    </span>
                    <span className="text-muted-foreground text-[10px]">
                      {members.length} players
                    </span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {members.map((row) => (
                      <LivePresenceCard
                        key={row.id}
                        row={row}
                        session={openSessionByTrackedId[row.id] ?? null}
                        nowMs={nowMs}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
            {soloRows.length > 0 ? (
              <div className="space-y-2">
                {livePartyGroups.length > 0 ? (
                  <div className="flex items-center gap-2 rounded-md border border-border/40 bg-muted/20 px-3 py-1.5">
                    <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                      Solo
                    </span>
                  </div>
                ) : null}
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {soloRows.map((row) => (
                    <LivePresenceCard
                      key={row.id}
                      row={row}
                      session={openSessionByTrackedId[row.id] ?? null}
                      nowMs={nowMs}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <RecentSessionsSection rows={recentSessions} partyMatches={partyMatches} />

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

