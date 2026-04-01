import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AutoRefresh } from "@/components/auto-refresh";
import { LeaderboardTable } from "@/components/leaderboard-table";
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

async function fetchLeaderboard() {
  const guildId = process.env.DISCORD_GUILD_ID ?? "";
  const query = guildId ? `?guildId=${encodeURIComponent(guildId)}` : "";

  const response = await fetch(
    `${process.env.WEB_BASE_URL ?? "http://localhost:3000"}/api/leaderboard${query}`,
    { next: { revalidate: 60 } }
  );

  if (!response.ok) {
    pageLog("leaderboard fetch failed", { status: response.status, guildId });
    return [];
  }
  const data = (await response.json()) as Array<{
    trackedAccountId: string;
    ign: string;
    platform: string;
    rankScore: number;
    rankName: string;
    deltaRp24h: number | null;
  }>;
  pageLog("leaderboard fetch ok", { guildId, count: data.length });
  return data;
}

async function fetchTracked(guildId: string) {
  const query = guildId ? `?guildId=${encodeURIComponent(guildId)}` : "";
  const response = await fetch(
    `${process.env.WEB_BASE_URL ?? "http://localhost:3000"}/api/tracked${query}`,
    { next: { revalidate: 60 } }
  );
  if (!response.ok) {
    pageLog("tracked fetch failed", { status: response.status, guildId });
    return [];
  }
  const data = (await response.json()) as Array<{
    id: string;
    ign: string;
    platform: string;
    ownerUserId: string;
    ownerDisplayName?: string | null;
    externalPlayerId: string | null;
    createdAt: string;
    lastCheckedAt: string | null;
  }>;
  pageLog("tracked fetch ok", { guildId, count: data.length });
  return data;
}

async function fetchLeaderboardTimelines(guildId: string) {
  const query = guildId ? `?guildId=${encodeURIComponent(guildId)}&hours=168` : "?hours=168";
  const response = await fetch(
    `${process.env.WEB_BASE_URL ?? "http://localhost:3000"}/api/leaderboard/timelines${query}`,
    { next: { revalidate: 60 } }
  );
  if (!response.ok) {
    pageLog("leaderboard timelines fetch failed", { status: response.status, guildId });
    return {} as Record<string, Array<{ capturedAt: string; rankScore: number }>>;
  }
  const data = (await response.json()) as Record<string, Array<{ capturedAt: string; rankScore: number }>>;
  pageLog("leaderboard timelines fetch ok", { players: Object.keys(data).length });
  return data;
}

async function fetchStats24h(guildId: string) {
  const query = guildId ? `?guildId=${encodeURIComponent(guildId)}` : "";
  const response = await fetch(
    `${process.env.WEB_BASE_URL ?? "http://localhost:3000"}/api/stats/24h${query}`,
    { next: { revalidate: 60 } }
  );
  if (!response.ok) {
    pageLog("stats24h fetch failed", { status: response.status, guildId });
    return {
      highestGainer: null,
      biggestLoser: null
    } as {
      highestGainer: { ign: string; platform: string; deltaRp: number } | null;
      biggestLoser: { ign: string; platform: string; deltaRp: number } | null;
    };
  }
  const data = (await response.json()) as {
    highestGainer: { ign: string; platform: string; deltaRp: number } | null;
    biggestLoser: { ign: string; platform: string; deltaRp: number } | null;
  };
  pageLog("stats24h fetch ok", {
    hasGainer: Boolean(data.highestGainer),
    hasLoser: Boolean(data.biggestLoser)
  });
  return data;
}

async function fetchServiceHealth() {
  const workerBaseUrl = process.env.WORKER_BASE_URL ?? `http://localhost:${process.env.WORKER_API_PORT ?? 4100}`;
  const discordBaseUrl = process.env.DISCORD_BOT_BASE_URL ?? `http://localhost:${process.env.DISCORD_BOT_PORT ?? 4300}`;

  const check = async (name: "worker" | "discord", baseUrl: string) => {
    const startedAt = Date.now();
    try {
      const response = await fetch(`${baseUrl}/health`, { cache: "no-store" });
      const latencyMs = Date.now() - startedAt;
      const body = response.ok ? ((await response.json()) as Record<string, unknown>) : null;
      return {
        name,
        up: response.ok,
        status: response.status,
        latencyMs,
        body
      };
    } catch {
      return {
        name,
        up: false,
        status: 0,
        latencyMs: Date.now() - startedAt,
        body: null
      };
    }
  };

  return Promise.all([check("worker", workerBaseUrl), check("discord", discordBaseUrl)]);
}

export default async function HomePage() {
  const guildId = process.env.DISCORD_GUILD_ID ?? "";
  pageLog("render start", { guildId, webBaseUrl: process.env.WEB_BASE_URL ?? "http://localhost:3000" });
  const leaderboard = await fetchLeaderboard();
  const tracked = await fetchTracked(guildId);
  const timelines = await fetchLeaderboardTimelines(guildId);
  const stats24h = await fetchStats24h(guildId);
  const serviceHealth = await fetchServiceHealth();
  const workerHealth = serviceHealth.find((item) => item.name === "worker");
  const discordHealth = serviceHealth.find((item) => item.name === "discord");
  const workerQueue =
    workerHealth?.body && typeof workerHealth.body === "object" && "queue" in workerHealth.body
      ? (workerHealth.body.queue as { activeCount?: number; dueCount?: number; claimedCount?: number })
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
    {} as Record<
      string,
      Array<{
        id: string;
        ign: string;
        platform: string;
        ownerUserId: string;
        ownerDisplayName?: string | null;
        externalPlayerId: string | null;
        createdAt: string;
        lastCheckedAt: string | null;
      }>
    >
  );
  const averageRp =
    leaderboard.length === 0
      ? 0
      : Math.round(leaderboard.reduce((sum, row) => sum + row.rankScore, 0) / leaderboard.length);
  pageLog("render data summary", {
    leaderboardCount: leaderboard.length,
    trackedCount: tracked.length,
    hasWorkerHealth: Boolean(workerHealth?.up)
  });

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <AutoRefresh intervalMs={60_000} />
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="Apex Assistant logo" width={44} height={44} className="rounded-full" priority />
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Apex Assistant</h1>
              <p className="text-muted-foreground text-sm">Live tracker dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-muted-foreground flex items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${workerHealth?.up ? "bg-emerald-400" : "bg-rose-400"}`}
                />
                <span className="inline-flex items-center gap-1.5">
                  <span>Worker</span>
                  {workerQueue ? (
                    <>
                      <span
                        className={(workerQueue.dueCount ?? 0) > 0 ? "text-amber-300" : "text-muted-foreground"}
                        title="Due accounts (ready to be polled)"
                      >
                        D:{workerQueue.dueCount ?? 0}
                      </span>
                      <span
                        className={(workerQueue.claimedCount ?? 0) > 0 ? "text-cyan-300" : "text-muted-foreground"}
                        title="Currently claimed by workers"
                      >
                        C:{workerQueue.claimedCount ?? 0}
                      </span>
                      <span className="text-muted-foreground" title="Total active tracked accounts">
                        A:{workerQueue.activeCount ?? 0}
                      </span>
                    </>
                  ) : null}
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5">
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
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-3.5 w-3.5">
                <path d="M10 2a4 4 0 100 8 4 4 0 000-8zM3 16a7 7 0 1114 0v1H3v-1z" />
              </svg>
            </div>
            <CardDescription className="text-xs">Tracked Players</CardDescription>
            <CardTitle className="text-xl">{tracked.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-cyan-500/20 bg-cyan-500/5">
          <CardHeader className="space-y-1.5 p-3">
            <div className="bg-cyan-500/15 text-cyan-300 inline-flex h-6 w-6 items-center justify-center rounded-md">
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-3.5 w-3.5">
                <path d="M4 15h2V8H4v7zm5 0h2V3H9v12zm5 0h2v-5h-2v5z" />
              </svg>
            </div>
            <CardDescription className="text-xs">Average RP</CardDescription>
            <CardTitle className="text-xl">{averageRp.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardHeader className="space-y-1.5 p-3">
            <div className="bg-amber-500/15 text-amber-300 inline-flex h-6 w-6 items-center justify-center rounded-md">
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-3.5 w-3.5">
                <path d="M5 3h10v2h1a1 1 0 011 1v2a4 4 0 01-4 4h-1.1A4 4 0 0111 13v2h2v2H7v-2h2v-2a4 4 0 01-.9-2H7a4 4 0 01-4-4V6a1 1 0 011-1h1V3zM5 7H4v1a2 2 0 002 2h1V7zm10 0h1v1a2 2 0 01-2 2h-1V7z" />
              </svg>
            </div>
            <CardDescription className="text-xs">Top Player</CardDescription>
            <CardTitle className="truncate text-lg">{top ? top.ign : ""}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardHeader className="space-y-1.5 p-3">
            <div className="bg-emerald-500/15 text-emerald-300 inline-flex h-6 w-6 items-center justify-center rounded-md">
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-3.5 w-3.5">
                <path d="M10 3l5 6h-3v8H8V9H5l5-6z" />
              </svg>
            </div>
            <CardDescription className="text-xs">Highest Gainer (24h)</CardDescription>
            <CardTitle className="truncate text-sm">{stats24h.highestGainer ? stats24h.highestGainer.ign : ""}</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            {stats24h.highestGainer ? (
              <div className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-300">
                <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-3.5 w-3.5">
                  <path d="M10 3l5 6h-3v8H8V9H5l5-6z" />
                </svg>
                <span>+{stats24h.highestGainer.deltaRp.toLocaleString()} RP</span>
              </div>
            ) : (
              <div className="h-5" />
            )}
          </CardContent>
        </Card>
        <Card className="border-rose-500/20 bg-rose-500/5">
          <CardHeader className="space-y-1.5 p-3">
            <div className="bg-rose-500/15 text-rose-300 inline-flex h-6 w-6 items-center justify-center rounded-md">
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-3.5 w-3.5">
                <path d="M10 17l-5-6h3V3h4v8h3l-5 6z" />
              </svg>
            </div>
            <CardDescription className="text-xs">Biggest Loser (24h)</CardDescription>
            <CardTitle className="truncate text-sm">{stats24h.biggestLoser ? stats24h.biggestLoser.ign : ""}</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            {stats24h.biggestLoser ? (
              <div className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-xs text-rose-300">
                <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-3.5 w-3.5">
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
          <CardDescription>Latest rank snapshot by tracked account.</CardDescription>
        </CardHeader>
        <CardContent>
          {leaderboard.length === 0 ? (
            <p className="text-muted-foreground text-sm">No leaderboard data yet. Run ingestion to populate snapshots.</p>
          ) : (
            <LeaderboardTable rows={leaderboard} timelines={timelines} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tracked Accounts</CardTitle>
          <CardDescription>Grouped by owner with tracking and sync timestamps.</CardDescription>
        </CardHeader>
        <CardContent>
          {tracked.length === 0 ? (
            <p className="text-muted-foreground text-sm">No tracked accounts yet.</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(trackedByOwner).map(([ownerName, accounts]) => (
                <div key={ownerName} className="overflow-x-auto rounded-lg border">
                  <div className="bg-muted/40 px-3 py-2 text-sm font-medium">{ownerName}</div>
                  <table className="w-full text-sm">
                    <thead className="bg-muted/20">
                      <tr className="text-left">
                        <th className="px-3 py-2 font-medium" title="Tracked player IGN">
                          Player
                        </th>
                        <th className="px-3 py-2 font-medium" title="Input platform used for provider lookups">
                          Platform
                        </th>
                        <th className="px-3 py-2 font-medium" title="Provider-specific unique account id">
                          Provider UID
                        </th>
                        <th className="px-3 py-2 font-medium" title="When this tracked account was created">
                          Date Added
                        </th>
                        <th className="px-3 py-2 font-medium" title="Last successful rank snapshot write">
                          Last Sync
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {accounts.map((row) => (
                        <tr key={row.id} className="border-t">
                          <td className="px-3 py-2 font-medium">{row.ign}</td>
                          <td className="px-3 py-2 uppercase">{row.platform}</td>
                          <td className="px-3 py-2 font-mono text-xs">{row.externalPlayerId ?? "-"}</td>
                          <td className="px-3 py-2">{new Date(row.createdAt).toLocaleString()}</td>
                          <td className="px-3 py-2">
                            {row.lastCheckedAt ? (
                              <span title={new Date(row.lastCheckedAt).toLocaleString()}>
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
