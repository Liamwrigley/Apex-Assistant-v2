import { AutoRefresh } from "@/components/auto-refresh";
import { LeaderboardCard } from "@/components/leaderboard-card";
import { LivePresenceCard } from "@/components/live-presence-card";
import { RecentSessionsSection } from "@/components/recent-sessions-section";
import { TrackedAccountsOwnerTable } from "@/components/tracked-accounts-owner-table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getDiscordBotBaseUrl,
  getWorkerBaseUrl,
} from "@/lib/service-base-urls";
import {
  getLeaderboardWithDelta24h,
  getOpenSessionSummariesForTrackedAccountIds,
  getRankMovers24h,
  getRankTimelinesByTrackedAccountIds,
  getRecentCompletedSessionsByGuild,
  listTrackedAccounts,
} from "@apex-assistant/db";
import { evaluateRealtimePresence } from "@/lib/realtime-presence";
import Image from "next/image";

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
  currentRankIconUrl: string | null;
};

type TLeaderboardRow = {
  trackedAccountId: string;
  ign: string;
  platform: string;
  rankScore: number;
  rankName: string;
  rankDivision: string | null;
  iconUrl: string | null;
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
  iconUrl: string | null;
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
  openSessionByTrackedId: Record<
    string,
    {
      startedAt: string;
      openingRankScore: number | null;
      latestRankScore: number | null;
      legends: string[];
    }
  >;
  recentSessions: Array<{
    sessionId: string;
    ign: string;
    platform: string;
    startedAt: string;
    endedAt: string;
    openingRankScore: number | null;
    latestRankScore: number | null;
    legends: string[];
  }>;
}> {
  const [leaderboardRows, trackedAccounts, stats24h] = await Promise.all([
    getLeaderboardWithDelta24h(guildFilter),
    listTrackedAccounts(guildFilter),
    getRankMovers24h(guildFilter),
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
      iconUrl: r.iconUrl ?? null,
      deltaRp24h: r.deltaRp24h,
    }));

  const trackedIds = leaderboard.map((r) => r.trackedAccountId);
  const timelinesRaw = await getRankTimelinesByTrackedAccountIds(
    trackedIds,
    168,
  );
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
    currentRankIconUrl: row.currentRankIconUrl ?? null,
  }));

  const allTrackedAccountIds = trackedAccounts.map((r) => r.id);
  const [openSessionSummaries, recentSessionsRaw] = await Promise.all([
    getOpenSessionSummariesForTrackedAccountIds(allTrackedAccountIds),
    guildFilter
      ? getRecentCompletedSessionsByGuild(guildFilter, 20)
      : Promise.resolve([]),
  ]);

  const openSessionByTrackedId: Record<
    string,
    {
      startedAt: string;
      openingRankScore: number | null;
      latestRankScore: number | null;
      legends: string[];
    }
  > = {};
  for (const s of openSessionSummaries) {
    openSessionByTrackedId[s.trackedAccountId] = {
      startedAt: toIso(s.startedAt),
      openingRankScore: s.openingRankScore,
      latestRankScore: s.latestRankScore,
      legends: s.legends,
    };
  }

  const recentSessions = recentSessionsRaw.map((r) => ({
    sessionId: r.sessionId,
    ign: r.ign,
    platform: r.platform,
    startedAt: toIso(r.startedAt),
    endedAt: toIso(r.endedAt),
    openingRankScore: r.openingRankScore,
    latestRankScore: r.latestRankScore,
    legends: r.legends,
  }));

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
      iconUrl: row?.iconUrl ?? null,
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
    leaderboard,
    tracked,
    timelines,
    stats24h: stats24hDisplay,
    openSessionByTrackedId,
    recentSessions,
  };
}

type TServiceHealthRow = {
  name: "worker" | "discord";
  baseUrl: string;
  healthUrl: string;
  up: boolean;
  status: number;
  latencyMs: number;
  body: Record<string, unknown> | null;
};

async function fetchServiceHealth(): Promise<TServiceHealthRow[]> {
  const workerBaseUrl = getWorkerBaseUrl();
  const discordBaseUrl = getDiscordBotBaseUrl();

  const check = async (
    name: "worker" | "discord",
    baseUrl: string,
  ): Promise<TServiceHealthRow> => {
    const healthUrl = `${baseUrl.replace(/\/$/, "")}/health`;
    const startedAt = Date.now();
    try {
      const response = await fetch(healthUrl, { cache: "no-store" });
      const latencyMs = Date.now() - startedAt;
      const body = response.ok
        ? ((await response.json()) as Record<string, unknown>)
        : null;
      return {
        name,
        baseUrl,
        healthUrl,
        up: response.ok,
        status: response.status,
        latencyMs,
        body,
      };
    } catch {
      return {
        name,
        baseUrl,
        healthUrl,
        up: false,
        status: 0,
        latencyMs: Date.now() - startedAt,
        body: null,
      };
    }
  };

  return Promise.all([
    check("worker", workerBaseUrl),
    check("discord", discordBaseUrl),
  ]);
}

function healthStatusTooltip(
  row: TServiceHealthRow | undefined,
): string | undefined {
  if (!row) {
    return undefined;
  }
  const origin = row.baseUrl.replace(/\/$/, "");
  const detail = row.up
    ? `${row.latencyMs} ms · HTTP ${row.status}`
    : "Unreachable or error";
  const lines = [`GET ${row.healthUrl}`, detail, `Base: ${origin}`];
  if (row.name === "worker") {
    lines.push(`Sync Now: POST ${origin}/ingest/{guildId}`);
  }
  return lines.join("\n");
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
    openSessionByTrackedId,
    recentSessions,
  } = await loadDashboardFromDb(guildFilter);
  const nowMs = Date.now();
  const serviceHealth = await fetchServiceHealth();
  const workerHealth = serviceHealth.find((item) => item.name === "worker");
  const discordHealth = serviceHealth.find((item) => item.name === "discord");
  const workerQueue =
    workerHealth?.body &&
    typeof workerHealth.body === "object" &&
    "queue" in workerHealth.body
      ? (workerHealth.body.queue as {
          activeCount?: number;
          dueCount?: number;
          claimedCount?: number;
        })
      : null;
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
    hasWorkerHealth: Boolean(workerHealth?.up),
  });

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <AutoRefresh intervalMs={60_000} />
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="Apex Assistant logo"
              width={44}
              height={44}
              className="rounded-full"
              priority
            />
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                Apex Assistant
              </h1>
              <p className="text-muted-foreground text-sm">
                Live tracker dashboard
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-muted-foreground flex items-center gap-3 text-xs">
              <span
                className="inline-flex cursor-help items-center gap-1.5"
                title={healthStatusTooltip(workerHealth)}
              >
                <span
                  className={`inline-block h-2 w-2 rounded-full ${workerHealth?.up ? "bg-emerald-400" : "bg-rose-400"}`}
                />
                <span className="inline-flex items-center gap-1.5">
                  <span>Worker</span>
                  {workerQueue ? (
                    <>
                      <span
                        className={
                          (workerQueue.dueCount ?? 0) > 0
                            ? "text-amber-300"
                            : "text-muted-foreground"
                        }
                        title="Due accounts (ready to be polled)"
                      >
                        D:{workerQueue.dueCount ?? 0}
                      </span>
                      <span
                        className={
                          (workerQueue.claimedCount ?? 0) > 0
                            ? "text-cyan-300"
                            : "text-muted-foreground"
                        }
                        title="Currently claimed by workers"
                      >
                        C:{workerQueue.claimedCount ?? 0}
                      </span>
                      <span
                        className="text-muted-foreground"
                        title="Total active tracked accounts"
                      >
                        A:{workerQueue.activeCount ?? 0}
                      </span>
                    </>
                  ) : null}
                </span>
              </span>
              <span
                className="inline-flex cursor-help items-center gap-1.5"
                title={healthStatusTooltip(discordHealth)}
              >
                <span
                  className={`inline-block h-2 w-2 rounded-full ${discordHealth?.up ? "bg-emerald-400" : "bg-rose-400"}`}
                />
                <span>Discord</span>
              </span>
            </div>
          </div>
        </div>
      </section>

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
              Realtime activity and the current online session (RP and legends while
              active).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {informativeRealtimeRows.map((row) => (
                <LivePresenceCard
                  key={row.id}
                  row={row}
                  session={openSessionByTrackedId[row.id] ?? null}
                  nowMs={nowMs}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <RecentSessionsSection rows={recentSessions} />

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

