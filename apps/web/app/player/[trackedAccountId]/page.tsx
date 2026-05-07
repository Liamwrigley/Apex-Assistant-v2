import { notFound } from "next/navigation";
import { cacheRead, CacheKeys } from "@apex-assistant/cache";
import { PendingLink } from "@/components/pending-link";
import { loadPlayerPage } from "@/lib/player-page-data";
import {
  PlayerProfileRangeProvider,
  PlayerProfileRangePicker,
} from "./profile-range-context";
import {
  PlayerProfileHeroImage,
  PlayerProfileLatestRpInline,
  PlayerProfileRangeStatsCareer,
  PlayerProfileRangeTimelineTables,
} from "./profile-range-panels";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { computeRankScoreDelta, RpDeltaBadge } from "@/components/rp-delta-badge";
import { SessionRankSnap, type TSessionRankSnap } from "@/components/session-rank-snap";
import { formatDurationMs } from "@/lib/format-duration";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { getLegendIconUrl } from "@/lib/legend-icon-url";
import { getRankIconUrl } from "@/lib/rank-icon-url";
import {
  evaluateRealtimePresence,
  REALTIME_PRESENCE_MAX_AGE_MINUTES,
  type TPresenceEvaluation,
} from "@/lib/realtime-presence";
import { AutoRefresh } from "@/components/auto-refresh";
import { RecentSessionsSection } from "@/components/recent-sessions-section";
import { StackMatesSection } from "./stack-mates-section";
import { cn } from "@/lib/utils";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function platformLabel(platform: string): string {
  const v = platform.toLowerCase();
  if (v === "origin" || v === "pc") return "PC";
  if (v === "psn" || v === "ps4") return "PS";
  if (v === "xbl" || v === "x1") return "XBOX";
  return platform.toUpperCase();
}

function isOfflineLikeStateLabel(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  const t = text.trim().toLowerCase();
  return ["offline", "afk", "disconnected", "not online"].some((frag) => t.includes(frag));
}

function offlinePresenceSubtitle(
  evaluation: TPresenceEvaluation,
  realtimeUpdatedAt: string | null | undefined
): { titleSuffix: string | null; description: string } {
  if (!realtimeUpdatedAt) {
    return {
      titleSuffix: null,
      description:
        "No realtime timestamp on file — we cannot show a live window until the next presence sync.",
    };
  }
  const rel = formatRelativeTime(realtimeUpdatedAt);
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
}) {
  const params = await props.params;
  const { trackedAccountId } = params;

  if (!UUID_RE.test(trackedAccountId)) {
    notFound();
  }

  const pageData = await cacheRead(
    CacheKeys.playerPage(trackedAccountId),
    () => loadPlayerPage(trackedAccountId),
  );

  if (!pageData) {
    notFound();
  }

  const { account, initialRangePayload, openSession, recentSessionRows, matches } = pageData;

  const lastSeenLegendIconUrl = account.realtimeSelectedLegend
    ? getLegendIconUrl(account.realtimeSelectedLegend)
    : null;
  const evaluation = evaluateRealtimePresence({
    realtimeUpdatedAt: account.realtimeUpdatedAt,
    realtimeIsOnline: account.realtimeIsOnline,
    realtimeIsInGame: account.realtimeIsInGame,
    realtimeCurrentState: account.realtimeCurrentState,
    realtimeCurrentStateAsText: account.realtimeCurrentStateAsText,
  });
  const isOnline = evaluation.shouldShow;
  const isInGame = evaluation.status === "in_game";

  const sessionRpDelta = openSession
    ? computeRankScoreDelta(openSession.openingRankScore, openSession.latestRankScore)
    : null;
  const nowMs = Date.now();
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
      <AutoRefresh intervalMs={30_000} />

      <PlayerProfileRangeProvider
        trackedAccountId={trackedAccountId}
        initial={initialRangePayload}
      >
      {/* Breadcrumb + range picker */}
      <div className="flex items-center justify-between gap-4">
        <nav className="text-muted-foreground text-sm">
          <PendingLink href="/" className="hover:text-foreground transition-colors">
            Dashboard
          </PendingLink>
          <span className="mx-1.5">/</span>
          <span className="text-foreground font-medium">{account.ign}</span>
        </nav>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-xs">
            {account.lastCheckedAt
              ? `Synced ${formatRelativeTime(account.lastCheckedAt)}`
              : "Never synced"}
          </span>
          <PlayerProfileRangePicker />
        </div>
      </div>

      {/* Profile card + right stats — stretch to one row height on md+ */}
      <div className="grid gap-6 md:grid-cols-[280px_1fr] md:items-stretch">
        {/* Left: visual hero card mirroring live presence */}
        <div className="relative isolate flex min-h-[400px] flex-col overflow-hidden rounded-lg border md:h-full md:min-h-0">
          <PlayerProfileHeroImage
            isOnline={isOnline}
            lastSeenLegendUrl={lastSeenLegendIconUrl}
            currentRankIconUrl={getRankIconUrl(account.currentRankName, account.currentRankDivision)}
            alt={account.realtimeSelectedLegend ?? account.ign}
          />

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
                    {getRankIconUrl(account.currentRankName, account.currentRankDivision) ? (
                      <img
                        src={getRankIconUrl(account.currentRankName, account.currentRankDivision)!}
                        alt=""
                        className="h-4 w-4 shrink-0 object-contain"
                      />
                    ) : null}
                    <span className="text-muted-foreground truncate text-[11px]">
                      {account.currentRankName}
                      {account.currentRankDivision ? ` ${account.currentRankDivision}` : ""}
                    </span>
                    <PlayerProfileLatestRpInline />
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
          <PlayerProfileRangeStatsCareer />

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
                      }}
                      compact
                    />
                    <SessionRankSnap
                      label="Now"
                      snap={{
                        rankScore: openSession.latestRankScore,
                        rankName: openSession.latestRankName,
                        rankDivision: openSession.latestRankDivision,
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
                                <img src={iconUrl} alt="" className="h-3.5 w-3.5 rounded-sm object-cover object-top" />
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

      <PlayerProfileRangeTimelineTables trackedAccountId={trackedAccountId} />

      <StackMatesSection playerIgn={account.ign} />

      <RecentSessionsSection
        rows={recentSessionRows}
        matches={matches}
        hidePlayerColumn
        titleSuffix={
          <span className="text-muted-foreground text-xs font-normal">
            last 30 sessions
          </span>
        }
        emptyCardContent={
          <p className="text-muted-foreground text-sm">No completed sessions yet.</p>
        }
      />
      </PlayerProfileRangeProvider>
    </main>
  );
}
