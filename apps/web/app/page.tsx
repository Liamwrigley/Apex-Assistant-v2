import { AutoRefresh } from "@/components/auto-refresh";
import { LeaderboardTable } from "@/components/leaderboard-table";
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
  getRankMovers24h,
  getRankTimelinesByTrackedAccountIds,
  listTrackedAccounts,
} from "@apex-assistant/db";
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

function formatRelativeTime(input: string): string {
  const then = new Date(input).getTime();
  const now = Date.now();
  const deltaMs = Math.max(0, now - then);
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d ago`;
  }
  const weeks = Math.floor(days / 7);
  if (weeks < 5) {
    return `${weeks}w ago`;
  }
  const months = Math.floor(days / 30);
  if (months < 12) {
    return `${months}mo ago`;
  }
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

type TTrackedRow = {
  id: string;
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
};

type TLeaderboardRow = {
  trackedAccountId: string;
  ign: string;
  platform: string;
  rankScore: number;
  rankName: string;
  deltaRp24h: number | null;
};

function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

function getLegendIconUrl(legend: string | null | undefined): string | null {
  if (!legend || !legend.trim()) {
    return null;
  }
  return `https://api.mozambiquehe.re/assets/icons/${encodeURIComponent(legend.toLowerCase())}.png`;
}

async function loadDashboardFromDb(guildFilter: string | undefined): Promise<{
  leaderboard: TLeaderboardRow[];
  tracked: TTrackedRow[];
  timelines: Record<string, Array<{ capturedAt: string; rankScore: number }>>;
  stats24h: {
    highestGainer: { ign: string; platform: string; deltaRp: number } | null;
    biggestLoser: { ign: string; platform: string; deltaRp: number } | null;
  };
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
  }));

  pageLog("dashboard db load", {
    guildFilter: guildFilter ?? null,
    leaderboardCount: leaderboard.length,
    trackedCount: tracked.length,
  });

  return { leaderboard, tracked, timelines, stats24h };
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
  const { leaderboard, tracked, timelines, stats24h } =
    await loadDashboardFromDb(guildFilter);
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
  const informativeRealtimeRows = tracked
    .filter((row) => {
      const state = row.realtimeCurrentStateAsText?.toLowerCase() ?? "";
      return (
        row.realtimeIsInGame === 1 ||
        row.realtimeIsOnline === 1 ||
        (state.length > 0 && state !== "offline")
      );
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
      return a.ign.localeCompare(b.ign);
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

      <section className="grid gap-4 md:grid-cols-5">
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardHeader className="space-y-1.5 p-3">
            <div className="bg-emerald-500/15 text-emerald-300 inline-flex h-6 w-6 items-center justify-center rounded-md">
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden
                className="h-3.5 w-3.5"
              >
                <path d="M10 2a4 4 0 100 8 4 4 0 000-8zM3 16a7 7 0 1114 0v1H3v-1z" />
              </svg>
            </div>
            <CardDescription className="text-xs">
              Tracked Players
            </CardDescription>
            <CardTitle className="text-xl">{tracked.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-cyan-500/20 bg-cyan-500/5">
          <CardHeader className="space-y-1.5 p-3">
            <div className="bg-cyan-500/15 text-cyan-300 inline-flex h-6 w-6 items-center justify-center rounded-md">
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden
                className="h-3.5 w-3.5"
              >
                <path d="M4 15h2V8H4v7zm5 0h2V3H9v12zm5 0h2v-5h-2v5z" />
              </svg>
            </div>
            <CardDescription className="text-xs">Average RP</CardDescription>
            <CardTitle className="text-xl">
              {averageRp.toLocaleString()}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardHeader className="space-y-1.5 p-3">
            <div className="bg-amber-500/15 text-amber-300 inline-flex h-6 w-6 items-center justify-center rounded-md">
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden
                className="h-3.5 w-3.5"
              >
                <path d="M5 3h10v2h1a1 1 0 011 1v2a4 4 0 01-4 4h-1.1A4 4 0 0111 13v2h2v2H7v-2h2v-2a4 4 0 01-.9-2H7a4 4 0 01-4-4V6a1 1 0 011-1h1V3zM5 7H4v1a2 2 0 002 2h1V7zm10 0h1v1a2 2 0 01-2 2h-1V7z" />
              </svg>
            </div>
            <CardDescription className="text-xs">Top Player</CardDescription>
            <CardTitle className="truncate text-lg">
              {top ? top.ign : ""}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardHeader className="space-y-1.5 p-3">
            <div className="bg-emerald-500/15 text-emerald-300 inline-flex h-6 w-6 items-center justify-center rounded-md">
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden
                className="h-3.5 w-3.5"
              >
                <path d="M10 3l5 6h-3v8H8V9H5l5-6z" />
              </svg>
            </div>
            <CardDescription className="text-xs">
              Highest Gainer (24h)
            </CardDescription>
            <CardTitle className="truncate text-sm">
              {stats24h.highestGainer ? stats24h.highestGainer.ign : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            {stats24h.highestGainer ? (
              <div className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-300">
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden
                  className="h-3.5 w-3.5"
                >
                  <path d="M10 3l5 6h-3v8H8V9H5l5-6z" />
                </svg>
                <span>
                  +{stats24h.highestGainer.deltaRp.toLocaleString()} RP
                </span>
              </div>
            ) : (
              <div className="h-5" />
            )}
          </CardContent>
        </Card>
        <Card className="border-rose-500/20 bg-rose-500/5">
          <CardHeader className="space-y-1.5 p-3">
            <div className="bg-rose-500/15 text-rose-300 inline-flex h-6 w-6 items-center justify-center rounded-md">
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden
                className="h-3.5 w-3.5"
              >
                <path d="M10 17l-5-6h3V3h4v8h3l-5 6z" />
              </svg>
            </div>
            <CardDescription className="text-xs">
              Biggest Loser (24h)
            </CardDescription>
            <CardTitle className="truncate text-sm">
              {stats24h.biggestLoser ? stats24h.biggestLoser.ign : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            {stats24h.biggestLoser ? (
              <div className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-xs text-rose-300">
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden
                  className="h-3.5 w-3.5"
                >
                  <path d="M10 17l-5-6h3V3h4v8h3l-5 6z" />
                </svg>
                <span>{stats24h.biggestLoser.deltaRp.toLocaleString()} RP</span>
              </div>
            ) : (
              <div className="h-5" />
            )}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Leaderboard</CardTitle>
          <CardDescription>
            Latest rank snapshot by tracked account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {leaderboard.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {tracked.length > 0
                ? "No rank snapshots yet for these tracked accounts. Run a sync from the worker so leaderboard rows appear (leaderboard only lists players with at least one snapshot)."
                : "No leaderboard data yet. Track accounts and run ingestion to populate snapshots."}
            </p>
          ) : (
            <LeaderboardTable rows={leaderboard} timelines={timelines} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live Presence</CardTitle>
          <CardDescription>Realtime player activity.</CardDescription>
        </CardHeader>
        <CardContent>
          {informativeRealtimeRows.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No activity right now.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {informativeRealtimeRows.map((row) => {
                const iconUrl = getLegendIconUrl(row.realtimeSelectedLegend);
                return (
                  <div
                    key={row.id}
                    className="bg-muted/20 flex items-center gap-3 rounded-md border p-3"
                  >
                    {iconUrl ? (
                      <img
                        src={iconUrl}
                        alt={row.realtimeSelectedLegend ?? "Legend"}
                        className="h-10 w-10 rounded-md border"
                      />
                    ) : (
                      <div className="bg-muted h-10 w-10 rounded-md border" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {row.ign}
                      </div>
                      <div className="text-muted-foreground truncate text-xs uppercase">
                        {row.platform}
                        {typeof row.currentLevel === "number"
                          ? ` • Lv ${row.currentLevel}`
                          : ""}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {row.realtimeIsInGame === 1 ? (
                          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300">
                            In Game
                          </span>
                        ) : null}
                        {row.realtimeIsOnline === 1 ? (
                          <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] text-cyan-300">
                            Online
                          </span>
                        ) : null}
                        {row.realtimeCanJoin === 1 ? (
                          <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] text-indigo-300">
                            Joinable
                          </span>
                        ) : null}
                        {row.realtimeCurrentStateAsText ? (
                          <span className="text-muted-foreground rounded bg-white/5 px-1.5 py-0.5 text-[10px]">
                            {row.realtimeCurrentStateAsText}
                          </span>
                        ) : null}
                        {row.realtimeSelectedLegend ? (
                          <span className="text-muted-foreground rounded bg-white/5 px-1.5 py-0.5 text-[10px]">
                            {row.realtimeSelectedLegend}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

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
                <div
                  key={ownerName}
                  className="overflow-x-auto rounded-lg border"
                >
                  <div className="bg-muted/40 px-3 py-2 text-sm font-medium">
                    {ownerName}
                  </div>
                  <table className="w-full table-fixed text-sm">
                    <colgroup>
                      <col className="w-[22%]" />
                      <col className="w-[12%]" />
                      <col className="w-[26%]" />
                      <col className="w-[24%]" />
                      <col className="w-[16%]" />
                    </colgroup>
                    <thead className="bg-muted/20">
                      <tr className="text-left">
                        <th
                          className="px-3 py-2 font-medium"
                          title="Tracked player IGN"
                        >
                          Player
                        </th>
                        <th
                          className="px-3 py-2 font-medium"
                          title="Input platform used for provider lookups"
                        >
                          Platform
                        </th>
                        <th
                          className="px-3 py-2 font-medium"
                          title="Provider-specific unique account id"
                        >
                          Provider UID
                        </th>
                        <th
                          className="px-3 py-2 font-medium"
                          title="When this tracked account was created"
                        >
                          Date Added
                        </th>
                        <th
                          className="px-3 py-2 font-medium text-right"
                          title="Last successful rank snapshot write"
                        >
                          Last Sync
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {accounts.map((row) => (
                        <tr key={row.id} className="border-t">
                          <td
                            className="px-3 py-2 font-medium truncate"
                            title={row.ign}
                          >
                            {row.ign}
                          </td>
                          <td className="px-3 py-2 uppercase whitespace-nowrap">
                            {row.platform}
                          </td>
                          <td
                            className="px-3 py-2 font-mono text-xs truncate"
                            title={row.externalPlayerId ?? "-"}
                          >
                            {row.externalPlayerId ?? "-"}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {new Date(row.createdAt).toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            {row.lastCheckedAt ? (
                              <span
                                title={new Date(
                                  row.lastCheckedAt,
                                ).toLocaleString()}
                              >
                                {formatRelativeTime(row.lastCheckedAt)}
                              </span>
                            ) : (
                              "Never"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
