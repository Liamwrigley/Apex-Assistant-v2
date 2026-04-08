import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getTrackedAccountById,
  getRankTimelineByTrackedAccountId,
  getRecentCompletedSessionsByAccount,
  getOpenSessionSummariesForTrackedAccountIds,
  getSegmentsBySession,
  getLegendAggregatesByAccount,
  getMapAggregatesByAccount,
  getCareerStatDeltasForTrackedAccount,
} from "@apex-assistant/db";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PlayerTimelineSparkline } from "@/components/player-timeline-sparkline";
import { computeRankScoreDelta, RpDeltaBadge } from "@/components/rp-delta-badge";
import { SessionRankSnap, type TSessionRankSnap } from "@/components/session-rank-snap";
import { formatDurationMs } from "@/lib/format-duration";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { getLegendIconUrl } from "@/lib/legend-icon-url";
import {
  evaluateRealtimePresence,
  REALTIME_PRESENCE_MAX_AGE_MINUTES,
  type TPresenceEvaluation,
} from "@/lib/realtime-presence";
import { AutoRefresh } from "@/components/auto-refresh";
import { PlayerProfileTimePicker } from "./time-picker";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function toSnap(
  score: number | null,
  name: string | null,
  division: string | null,
  icon: string | null
): TSessionRankSnap {
  return { rankScore: score, rankName: name, rankDivision: division, iconUrl: icon };
}

function platformLabel(platform: string): string {
  const v = platform.toLowerCase();
  if (v === "origin" || v === "pc") return "PC";
  if (v === "psn" || v === "ps4") return "PS";
  if (v === "xbl" || v === "x1") return "XBOX";
  return platform.toUpperCase();
}

const confidenceBg: Record<string, string> = {
  high: "bg-green-500/20 text-green-300",
  medium: "bg-yellow-500/20 text-yellow-300",
  low: "bg-red-500/20 text-red-300",
};

function isOfflineLikeStateLabel(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  const t = text.trim().toLowerCase();
  return ["offline", "afk", "disconnected", "not online"].some((frag) => t.includes(frag));
}

/** Subtitle for offline card: aligned with evaluateRealtimePresence (15m freshness + derived status). */
function offlinePresenceSubtitle(
  evaluation: TPresenceEvaluation,
  realtimeUpdatedAt: Date | string | null | undefined
): { titleSuffix: string | null; description: string } {
  if (!realtimeUpdatedAt) {
    return {
      titleSuffix: null,
      description:
        "No realtime timestamp on file — we cannot show a live window until the next presence sync.",
    };
  }
  const rel = formatRelativeTime(toIso(realtimeUpdatedAt));
  if (!evaluation.isFresh) {
    return {
      titleSuffix: `· Last realtime ${rel}`,
      description: `Outside the ${REALTIME_PRESENCE_MAX_AGE_MINUTES}-minute live window, so status is treated as offline until fresher data arrives.`,
    };
  }
  if (evaluation.reason === "derived_offline") {
    return {
      titleSuffix: `· Snapshot ${rel}`,
      description:
        "Realtime data is fresh; the account is reporting as offline in the last snapshot.",
    };
  }
  return {
    titleSuffix: `· Last realtime ${rel}`,
    description:
      "Realtime data is fresh but presence state is ambiguous; showing as offline.",
  };
}

export default async function PlayerProfilePage(props: {
  params: Promise<{ trackedAccountId: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const { trackedAccountId } = params;

  if (!UUID_RE.test(trackedAccountId)) {
    notFound();
  }

  const account = await getTrackedAccountById(trackedAccountId);
  if (!account) {
    notFound();
  }

  const rangeKey = searchParams.range ?? "7d";
  const hours = HOUR_OPTIONS[rangeKey] ?? 168;

  const [
    timelineRaw,
    recentSessions,
    openSessionSummaries,
    legendAggregates,
    mapAggregates,
    careerDeltas,
  ] = await Promise.all([
    getRankTimelineByTrackedAccountId(trackedAccountId, hours),
    getRecentCompletedSessionsByAccount(trackedAccountId, 30),
    getOpenSessionSummariesForTrackedAccountIds([trackedAccountId]),
    getLegendAggregatesByAccount(trackedAccountId, hours),
    getMapAggregatesByAccount(trackedAccountId, hours),
    getCareerStatDeltasForTrackedAccount(trackedAccountId, hours),
  ]);

  const timelinePoints = timelineRaw.map((p) => ({
    capturedAt: toIso(p.capturedAt),
    rankScore: p.rankScore,
  }));

  const openSession = openSessionSummaries[0] ?? null;

  const sessionIds = recentSessions.map((r) => r.sessionId);
  const segmentsBySession: Record<string, Awaited<ReturnType<typeof getSegmentsBySession>>> = {};
  await Promise.all(
    sessionIds.map(async (sid) => {
      segmentsBySession[sid] = await getSegmentsBySession(sid);
    })
  );

  const latestScore = timelinePoints.length > 0
    ? timelinePoints[timelinePoints.length - 1].rankScore
    : null;

  const mostPlayedLegend = legendAggregates.length > 0 ? legendAggregates[0] : null;
  const mostPlayedLegendIconUrl = mostPlayedLegend
    ? getLegendIconUrl(mostPlayedLegend.legend)
    : null;

  const bestLegend =
    legendAggregates.length > 0
      ? [...legendAggregates].sort((a, b) => {
          if (b.avgRpDelta !== a.avgRpDelta) return b.avgRpDelta - a.avgRpDelta;
          return b.games - a.games;
        })[0]
      : null;
  const bestLegendIconUrl = bestLegend ? getLegendIconUrl(bestLegend.legend) : null;

  const totalGames = legendAggregates.reduce((s, r) => s + r.games, 0);
  const totalRpDelta = legendAggregates.reduce((s, r) => s + r.totalRpDelta, 0);

  const nowMs = Date.now();
  const evaluation = evaluateRealtimePresence({
    realtimeUpdatedAt: account.realtimeUpdatedAt ? toIso(account.realtimeUpdatedAt) : null,
    realtimeIsOnline: account.realtimeIsOnline,
    realtimeIsInGame: account.realtimeIsInGame,
    realtimeCurrentState: account.realtimeCurrentState,
    realtimeCurrentStateAsText: account.realtimeCurrentStateAsText,
  });
  const isOnline = evaluation.shouldShow;
  const isInGame = evaluation.status === "in_game";

  // Hero image priority: current legend (if online) > most played > last-seen legend > rank icon
  const lastSeenLegendUrl = account.realtimeSelectedLegend
    ? getLegendIconUrl(account.realtimeSelectedLegend)
    : null;
  const heroIconUrl = (() => {
    if (isOnline && lastSeenLegendUrl) return lastSeenLegendUrl;
    if (mostPlayedLegendIconUrl) return mostPlayedLegendIconUrl;
    if (lastSeenLegendUrl) return lastSeenLegendUrl;
    return account.currentRankIconUrl;
  })();

  const sessionRpDelta = openSession
    ? computeRankScoreDelta(openSession.openingRankScore, openSession.latestRankScore)
    : null;
  const elapsedMs = openSession
    ? Math.max(0, nowMs - new Date(openSession.startedAt).getTime())
    : 0;

  const glassPanelClass = cn(
    "rounded-lg border border-white/15 shadow-lg",
    "bg-background/78 backdrop-blur-md supports-[backdrop-filter]:bg-background/65"
  );

  const offlinePresenceCopy = offlinePresenceSubtitle(
    evaluation,
    account.realtimeUpdatedAt
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <AutoRefresh intervalMs={60_000} />

      {/* Breadcrumb + range picker */}
      <div className="flex items-center justify-between gap-4">
        <nav className="text-muted-foreground text-sm">
          <Link href="/" className="hover:text-foreground transition-colors">Dashboard</Link>
          <span className="mx-1.5">/</span>
          <span className="text-foreground font-medium">{account.ign}</span>
        </nav>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-xs">
            {account.lastCheckedAt
              ? `Synced ${formatRelativeTime(toIso(account.lastCheckedAt))}`
              : "Never synced"}
          </span>
          <PlayerProfileTimePicker current={rangeKey} />
        </div>
      </div>

      {/* Profile card + right stats — stretch to one row height on md+ */}
      <div className="grid gap-6 md:grid-cols-[280px_1fr] md:items-stretch">
        {/* Left: visual hero card mirroring live presence */}
        <div className="relative isolate flex min-h-[400px] flex-col overflow-hidden rounded-lg border md:h-full md:min-h-0">
          {heroIconUrl ? (
            <img
              src={heroIconUrl}
              alt={account.realtimeSelectedLegend ?? mostPlayedLegend?.legend ?? account.ign}
              className="absolute inset-0 h-full w-full object-cover object-top"
            />
          ) : (
            <div className="absolute inset-0 bg-muted" aria-hidden />
          )}

          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/15 via-black/25 to-black/65"
            aria-hidden
          />

          <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
            <div className="min-h-[180px] flex-1" aria-hidden />
            <div className="flex flex-none flex-col gap-2 p-2.5">
              <div className={cn(glassPanelClass, "px-2.5 py-2")}>
                <div className="truncate text-sm font-medium text-foreground">
                  {account.ign}
                </div>
                <div className="text-muted-foreground mt-0.5 truncate text-xs">
                  {typeof account.currentLevel === "number"
                    ? `Lv ${account.currentLevel}`
                    : "\u00a0"}
                </div>
                {account.currentRankName ? (
                  <div className="mt-1 flex items-center gap-1.5">
                    {account.currentRankIconUrl ? (
                      <img
                        src={account.currentRankIconUrl}
                        alt=""
                        className="h-4 w-4 shrink-0 object-contain"
                      />
                    ) : null}
                    <span className="text-muted-foreground truncate text-[11px]">
                      {account.currentRankName}
                      {account.currentRankDivision ? ` ${account.currentRankDivision}` : ""}
                    </span>
                    {latestScore !== null ? (
                      <span className="text-muted-foreground text-[11px] tabular-nums">
                        · {latestScore.toLocaleString()} RP
                      </span>
                    ) : null}
                  </div>
                ) : null}

                <div className="border-border/50 mt-2 flex flex-wrap gap-1 border-t border-dashed pt-2">
                  <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] text-violet-700 dark:text-violet-300">
                    {platformLabel(account.platform)}
                  </span>
                  {isOnline ? (
                    isInGame ? (
                      <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-800 dark:text-emerald-300">
                        In game
                      </span>
                    ) : (
                      <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] text-sky-800 dark:text-sky-300">
                        Online
                      </span>
                    )
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] text-rose-800 dark:text-rose-300">
                      <span
                        className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.55)]"
                        aria-hidden
                      />
                      Offline
                    </span>
                  )}
                  {account.realtimeCanJoin === 1 && isOnline ? (
                    <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] text-indigo-800 dark:text-indigo-300">
                      Joinable
                    </span>
                  ) : null}
                  {isOnline &&
                   account.realtimeCurrentStateAsText &&
                   !isOfflineLikeStateLabel(account.realtimeCurrentStateAsText) ? (
                    <span className="text-muted-foreground rounded bg-foreground/5 px-1.5 py-0.5 text-[10px]">
                      {account.realtimeCurrentStateAsText}
                    </span>
                  ) : null}
                  {isOnline && account.realtimeLobbyState ? (
                    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-900 dark:text-amber-300">
                      Lobby: {account.realtimeLobbyState}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: stats summary + current session / offline — fills grid row height */}
        <div className="flex min-h-[400px] flex-col gap-4 md:h-full md:min-h-0">
          {/* Overall stats row */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="border-emerald-500/20 bg-emerald-500/5">
              <CardHeader className="space-y-1 p-2.5">
                <CardDescription className="text-[11px] leading-none">Games ({rangeKey})</CardDescription>
                <CardTitle className="text-lg font-semibold tabular-nums leading-tight">
                  {totalGames}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-cyan-500/20 bg-cyan-500/5">
              <CardHeader className="space-y-1 p-2.5">
                <CardDescription className="text-[11px] leading-none">Net RP ({rangeKey})</CardDescription>
                <CardTitle className="text-lg font-semibold leading-tight">
                  <RpDeltaBadge delta={totalGames > 0 ? totalRpDelta : null} />
                </CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-violet-500/20 bg-violet-500/5">
              <CardHeader className="space-y-1 p-2.5">
                <CardDescription className="text-[11px] leading-none">Best legend ({rangeKey})</CardDescription>
                <CardTitle className="flex flex-col items-start gap-0.5 text-lg font-semibold leading-tight">
                  {bestLegend ? (
                    <>
                      <span className="flex min-w-0 items-center gap-1.5">
                        {bestLegendIconUrl ? (
                          <img src={bestLegendIconUrl} alt="" className="h-5 w-5 shrink-0 rounded-sm object-cover" />
                        ) : null}
                        <span className="truncate">{bestLegend.legend}</span>
                      </span>
                      <span className="text-muted-foreground text-xs font-normal tabular-nums">
                        Avg <RpDeltaBadge delta={bestLegend.avgRpDelta} /> · {bestLegend.games} game
                        {bestLegend.games !== 1 ? "s" : ""}
                      </span>
                    </>
                  ) : (
                    "—"
                  )}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-amber-500/20 bg-amber-500/5">
              <CardHeader className="space-y-1 p-2.5">
                <CardDescription className="text-[11px] leading-none">Most played ({rangeKey})</CardDescription>
                <CardTitle className="flex flex-col items-start gap-0.5 text-lg font-semibold leading-tight">
                  {mostPlayedLegend ? (
                    <>
                      <span className="flex min-w-0 items-center gap-1.5">
                        {mostPlayedLegendIconUrl ? (
                          <img
                            src={mostPlayedLegendIconUrl}
                            alt=""
                            className="h-5 w-5 shrink-0 rounded-sm object-cover"
                          />
                        ) : null}
                        <span className="truncate">{mostPlayedLegend.legend}</span>
                      </span>
                      <span className="text-muted-foreground text-xs font-normal tabular-nums">
                        {mostPlayedLegend.games} game{mostPlayedLegend.games !== 1 ? "s" : ""}
                      </span>
                    </>
                  ) : (
                    "—"
                  )}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          {/* Career — neutral shell so delta badges (green/red) read clearly */}
          {(account.careerKills !== null || account.careerDamage !== null || account.careerWins !== null) ? (
            <Card className="border-border/80 bg-muted/25">
              <CardContent className="p-0 px-4 py-3.5 sm:px-5">
              <div className="mb-3 flex items-center gap-3">
                <span
                  className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent"
                  aria-hidden
                />
                <span className="text-muted-foreground flex shrink-0 flex-col items-center gap-0.5 text-center">
                  <span className="text-[10px] font-medium uppercase tracking-[0.18em]">
                    Career
                  </span>
                  <span className="text-[10px] font-normal normal-case tracking-normal text-muted-foreground/90">
                    Δ vs {rangeKey}
                  </span>
                </span>
                <span
                  className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent"
                  aria-hidden
                />
              </div>
              <div className="grid grid-cols-3 divide-x divide-border/60">
                <div className="min-w-0 pr-4 sm:pr-8">
                  <p className="text-muted-foreground text-[11px] tracking-wide">Kills</p>
                  <p className="mt-0.5 truncate text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">
                    {account.careerKills?.toLocaleString() ?? "—"}
                  </p>
                  <div className="mt-1.5">
                    <RpDeltaBadge delta={careerDeltas.deltaKills} />
                  </div>
                </div>
                <div className="min-w-0 px-4 sm:px-8">
                  <p className="text-muted-foreground text-[11px] tracking-wide">Damage</p>
                  <p className="mt-0.5 truncate text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">
                    {account.careerDamage?.toLocaleString() ?? "—"}
                  </p>
                  <div className="mt-1.5">
                    <RpDeltaBadge delta={careerDeltas.deltaDamage} />
                  </div>
                </div>
                <div className="min-w-0 pl-4 sm:pl-8">
                  <p className="text-muted-foreground text-[11px] tracking-wide">Wins</p>
                  <p className="mt-0.5 truncate text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">
                    {account.careerWins?.toLocaleString() ?? "—"}
                  </p>
                  <div className="mt-1.5">
                    <RpDeltaBadge delta={careerDeltas.deltaWins} />
                  </div>
                </div>
              </div>
              </CardContent>
            </Card>
          ) : null}

          {/* Current session (live) vs offline */}
          {openSession || !isOnline ? (
            openSession ? (
            <Card className="min-h-[175px] border-cyan-500/30 bg-cyan-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <span
                    className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.45)]"
                    aria-hidden
                  />
                  Current Session
                  <span className="text-muted-foreground text-xs font-normal">
                    · {formatDurationMs(elapsedMs)}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-3 text-sm">
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <SessionRankSnap
                      label="Start"
                      snap={{
                        rankScore: openSession.openingRankScore,
                        rankName: openSession.openingRankName,
                        rankDivision: openSession.openingRankDivision,
                        iconUrl: openSession.openingRankIconUrl,
                      }}
                      compact
                    />
                    <SessionRankSnap
                      label="Now"
                      snap={{
                        rankScore: openSession.latestRankScore,
                        rankName: openSession.latestRankName,
                        rankDivision: openSession.latestRankDivision,
                        iconUrl: openSession.latestRankIconUrl,
                      }}
                      compact
                    />
                    <div>
                      <div className="text-muted-foreground mb-0.5 text-[10px] font-medium tracking-wide uppercase">
                        RP Change
                      </div>
                      <RpDeltaBadge delta={sessionRpDelta} />
                    </div>
                  </div>

                  {openSession.legends.length > 0 ? (
                    <div>
                      <div className="text-muted-foreground mb-1 text-[10px] font-medium tracking-wide uppercase">
                        Legends
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {openSession.legends.map((name) => {
                          const iconUrl = getLegendIconUrl(name);
                          return (
                            <span
                              key={name}
                              className="bg-muted/60 inline-flex items-center gap-1 rounded px-1.5 py-0.5"
                              title={name}
                            >
                              {iconUrl ? (
                                <img src={iconUrl} alt="" className="h-3.5 w-3.5 rounded-sm object-cover" />
                              ) : null}
                              <span className="max-w-[7rem] truncate text-[10px]">{name}</span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="min-h-[175px] border-rose-500/30 bg-rose-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span
                    className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.55)]"
                    aria-hidden
                  />
                  <span>Offline</span>
                  {offlinePresenceCopy.titleSuffix ? (
                    <span className="text-muted-foreground text-xs font-normal">
                      {offlinePresenceCopy.titleSuffix}
                    </span>
                  ) : null}
                </CardTitle>
                <CardDescription className="text-xs">
                  {offlinePresenceCopy.description}
                </CardDescription>
              </CardHeader>
            </Card>
          )
          ) : null}

        </div>
      </div>

      {/* RP Timeline Sparkline */}
      <Card>
        <CardHeader>
          <CardTitle>RP Timeline</CardTitle>
          <CardDescription>Rank score over the selected time range.</CardDescription>
        </CardHeader>
        <CardContent>
          {timelinePoints.length >= 2 ? (
            <PlayerTimelineSparkline
              trackedAccountId={trackedAccountId}
              points={timelinePoints}
              variant="profile"
            />
          ) : (
            <p className="text-muted-foreground text-sm">Not enough data for a timeline.</p>
          )}
        </CardContent>
      </Card>

      {/* Legend Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Legend Performance</CardTitle>
          <CardDescription>
            Aggregated RP per legend ({rangeKey}).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {legendAggregates.length === 0 ? (
            <p className="text-muted-foreground text-sm">No completed segments with legend data yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-xs">
                    <th className="px-2 py-2 font-medium">Legend</th>
                    <th className="px-2 py-2 font-medium text-right">Games</th>
                    <th className="px-2 py-2 font-medium text-right">Total RP</th>
                    <th className="px-2 py-2 font-medium text-right">Avg RP</th>
                    <th className="px-2 py-2 font-medium text-right">W / L</th>
                  </tr>
                </thead>
                <tbody>
                  {legendAggregates.map((row) => {
                    const iconUrl = getLegendIconUrl(row.legend);
                    return (
                      <tr key={row.legend} className="border-border/60 border-b last:border-0">
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-2">
                            {iconUrl ? (
                              <img src={iconUrl} alt="" className="h-5 w-5 rounded-sm object-cover" />
                            ) : null}
                            <span className="font-medium">{row.legend}</span>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{row.games}</td>
                        <td className="px-2 py-2 text-right">
                          <RpDeltaBadge delta={row.totalRpDelta} />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <RpDeltaBadge delta={row.avgRpDelta} />
                        </td>
                        <td className="text-muted-foreground px-2 py-2 text-right tabular-nums">
                          {row.wins} / {row.losses}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Map Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Map Performance</CardTitle>
          <CardDescription>
            RP breakdown by ranked map ({rangeKey}).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mapAggregates.length === 0 ? (
            <p className="text-muted-foreground text-sm">No map data yet (populates as new games are tracked).</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-xs">
                    <th className="px-2 py-2 font-medium">Map</th>
                    <th className="px-2 py-2 font-medium text-right">Games</th>
                    <th className="px-2 py-2 font-medium text-right">Total RP</th>
                    <th className="px-2 py-2 font-medium text-right">Avg RP</th>
                  </tr>
                </thead>
                <tbody>
                  {mapAggregates.map((row) => (
                    <tr key={row.mapName} className="border-border/60 border-b last:border-0">
                      <td className="px-2 py-2 font-medium">{row.mapName}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{row.games}</td>
                      <td className="px-2 py-2 text-right">
                        <RpDeltaBadge delta={row.totalRpDelta} />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <RpDeltaBadge delta={row.avgRpDelta} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Completed Sessions */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Sessions</CardTitle>
          <CardDescription>
            Completed play sessions with rank changes, legends, and estimated games.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {recentSessions.length === 0 ? (
            <p className="text-muted-foreground text-sm">No completed sessions yet.</p>
          ) : (
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-xs">
                  <th className="px-2 py-2 font-medium">Start</th>
                  <th className="px-2 py-2 font-medium">End</th>
                  <th className="px-2 py-2 font-medium">RP Δ</th>
                  <th className="px-2 py-2 font-medium">Legends</th>
                  <th className="px-2 py-2 font-medium">Est. Games</th>
                  <th className="px-2 py-2 font-medium">Duration</th>
                  <th className="px-2 py-2 text-right font-medium">Finished</th>
                </tr>
              </thead>
              <tbody>
                {recentSessions.map((row) => {
                  const durationMs =
                    new Date(row.endedAt).getTime() -
                    new Date(row.startedAt).getTime();
                  const rpDelta = computeRankScoreDelta(
                    row.openingRankScore,
                    row.latestRankScore
                  );
                  const startSnap = toSnap(
                    row.openingRankScore,
                    row.openingRankName,
                    row.openingRankDivision,
                    row.openingRankIconUrl
                  );
                  const endSnap = toSnap(
                    row.latestRankScore,
                    row.latestRankName,
                    row.latestRankDivision,
                    row.latestRankIconUrl
                  );
                  const segments = segmentsBySession[row.sessionId] ?? [];
                  return (
                    <tr key={row.sessionId} className="border-border/60 border-b last:border-0">
                      <td className="px-2 py-2 align-top">
                        <SessionRankSnap snap={startSnap} compact />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <SessionRankSnap snap={endSnap} compact />
                      </td>
                      <td className="px-2 py-2 align-middle">
                        <RpDeltaBadge delta={rpDelta} />
                      </td>
                      <td className="px-2 py-2 align-middle">
                        {row.legends.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1">
                            {row.legends.map((name) => {
                              const iconUrl = getLegendIconUrl(name);
                              return (
                                <span
                                  key={name}
                                  className="bg-muted/60 inline-flex items-center gap-1 rounded px-1 py-0.5"
                                  title={name}
                                >
                                  {iconUrl ? (
                                    <img
                                      src={iconUrl}
                                      alt=""
                                      className="h-3.5 w-3.5 rounded-sm object-cover"
                                    />
                                  ) : null}
                                  <span className="max-w-[5rem] truncate text-[10px]">
                                    {name}
                                  </span>
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 align-middle">
                        {segments.length === 0 ? (
                          <span className="text-muted-foreground text-xs">—</span>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs tabular-nums">
                              {segments.length} game{segments.length !== 1 ? "s" : ""}
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {segments.map((g, i) => (
                                <span
                                  key={i}
                                  className={`inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] ${confidenceBg[g.confidence] ?? "bg-muted/60"}`}
                                  title={`${g.legendAssumed ?? "?"} | RP: ${g.rpDelta ?? "?"} | ${g.confidence}${g.mergeRisk ? " | merge risk" : ""}`}
                                >
                                  <span className="max-w-[4rem] truncate">{g.legendAssumed ?? "?"}</span>
                                  {g.rpDelta !== null ? (
                                    <span className={g.rpDelta > 0 ? "text-green-400" : g.rpDelta < 0 ? "text-red-400" : "text-muted-foreground"}>
                                      {g.rpDelta > 0 ? "+" : ""}{g.rpDelta}
                                    </span>
                                  ) : null}
                                  {g.mergeRisk ? <span className="text-orange-400" title="Possible merged games">!</span> : null}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="text-muted-foreground px-2 py-2 align-middle tabular-nums">
                        {formatDurationMs(durationMs)}
                      </td>
                      <td className="text-muted-foreground px-2 py-2 text-right align-middle text-xs">
                        {formatRelativeTime(toIso(row.endedAt))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
