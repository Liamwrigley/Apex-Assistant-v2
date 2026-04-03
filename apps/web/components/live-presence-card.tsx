import { evaluateRealtimePresence } from "@/lib/realtime-presence";
import { formatDurationMs } from "@/lib/format-duration";
import { computeRankScoreDelta, RpDeltaBadge } from "@/components/rp-delta-badge";
import { SessionRankSnap } from "@/components/session-rank-snap";
import { getLegendIconUrl } from "@/lib/legend-icon-url";
import { cn } from "@/lib/utils";

export type TLivePresenceCardRow = {
  id: string;
  ign: string;
  platform: string;
  currentLevel: number | null;
  realtimeSelectedLegend: string | null;
  realtimeIsOnline: number | null;
  realtimeIsInGame: number | null;
  realtimeCanJoin: number | null;
  realtimeCurrentState: string | null;
  realtimeCurrentStateAsText: string | null;
  realtimeLobbyState: string | null;
  realtimeUpdatedAt: string | null;
  currentRankName: string | null;
  currentRankDivision: string | null;
  currentRankIconUrl: string | null;
};

export type TLivePresenceSessionProps = {
  startedAt: string;
  openingRankScore: number | null;
  latestRankScore: number | null;
  openingRankName: string | null;
  openingRankDivision: string | null;
  openingRankIconUrl: string | null;
  latestRankName: string | null;
  latestRankDivision: string | null;
  latestRankIconUrl: string | null;
  legends: string[];
} | null;

function platformChipLabel(platform: string): string {
  const value = platform.toLowerCase();
  if (value === "origin" || value === "pc") {
    return "PC";
  }
  if (value === "psn" || value === "ps4") {
    return "PS";
  }
  if (value === "xbl" || value === "x1") {
    return "XBOX";
  }
  return platform.toUpperCase();
}

function isOfflineLikeStateLabel(text: string | null | undefined): boolean {
  if (!text?.trim()) {
    return false;
  }
  const t = text.trim().toLowerCase();
  return ["offline", "afk", "disconnected", "not online"].some((frag) =>
    t.includes(frag)
  );
}

const glassPanelClass = cn(
  "rounded-lg border border-white/15 shadow-lg",
  "bg-background/78 backdrop-blur-md supports-[backdrop-filter]:bg-background/65"
);

export function LivePresenceCard(props: {
  row: TLivePresenceCardRow;
  session: TLivePresenceSessionProps;
  /** Server time when the page was rendered (for elapsed session). */
  nowMs: number;
}) {
  const { row, session, nowMs } = props;
  const legendIconUrl = getLegendIconUrl(row.realtimeSelectedLegend);
  const heroIconUrl = legendIconUrl ?? row.currentRankIconUrl;

  const evaluation = evaluateRealtimePresence({
    realtimeUpdatedAt: row.realtimeUpdatedAt,
    realtimeIsOnline: row.realtimeIsOnline,
    realtimeIsInGame: row.realtimeIsInGame,
    realtimeCurrentState: row.realtimeCurrentState,
    realtimeCurrentStateAsText: row.realtimeCurrentStateAsText
  });
  const showInGame = evaluation.status === "in_game";

  const sessionRpDelta = session
    ? computeRankScoreDelta(session.openingRankScore, session.latestRankScore)
    : null;
  const elapsedMs = session
    ? Math.max(0, nowMs - new Date(session.startedAt).getTime())
    : 0;

  return (
    <div
      className={cn(
        "relative isolate flex min-h-[360px] flex-col overflow-hidden rounded-lg border"
      )}
    >
      {heroIconUrl ? (
        <img
          src={heroIconUrl}
          alt={
            row.realtimeSelectedLegend ?? row.currentRankName ?? "Player"
          }
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
        <div className="min-h-[200px] flex-[2]" aria-hidden />
        <div className="flex flex-none flex-col gap-2 p-2.5">
          <div className={cn(glassPanelClass, "px-2.5 py-2")}>
            <div className="truncate text-sm font-medium text-foreground">
              {row.ign}
            </div>
            <div className="text-muted-foreground mt-0.5 truncate text-xs">
              {typeof row.currentLevel === "number"
                ? `Lv ${row.currentLevel}`
                : "\u00a0"}
            </div>
            {row.currentRankName ? (
              <div className="mt-1 flex items-center gap-1.5">
                {row.currentRankIconUrl ? (
                  <img
                    src={row.currentRankIconUrl}
                    alt=""
                    className="h-4 w-4 shrink-0 object-contain"
                  />
                ) : null}
                <span className="text-muted-foreground truncate text-[11px]">
                  {row.currentRankName}
                  {row.currentRankDivision ? ` ${row.currentRankDivision}` : ""}
                </span>
              </div>
            ) : null}

            <div className="border-border/50 mt-2 flex flex-wrap gap-1 border-t border-dashed pt-2">
              <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] text-violet-700 dark:text-violet-300">
                {platformChipLabel(row.platform)}
              </span>
              {showInGame ? (
                <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-800 dark:text-emerald-300">
                  In game
                </span>
              ) : (
                <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] text-sky-800 dark:text-sky-300">
                  Online
                </span>
              )}
              {row.realtimeCanJoin === 1 ? (
                <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] text-indigo-800 dark:text-indigo-300">
                  Joinable
                </span>
              ) : null}
              {row.realtimeCurrentStateAsText &&
              !isOfflineLikeStateLabel(row.realtimeCurrentStateAsText) ? (
                <span className="text-muted-foreground rounded bg-foreground/5 px-1.5 py-0.5 text-[10px]">
                  {row.realtimeCurrentStateAsText}
                </span>
              ) : null}
              {row.realtimeLobbyState ? (
                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-900 dark:text-amber-300">
                  Lobby: {row.realtimeLobbyState}
                </span>
              ) : null}
            </div>
          </div>

          <div className={cn(glassPanelClass, "px-2.5 py-2")}>
            <div className="text-muted-foreground mb-1.5 text-[10px] font-medium tracking-wide uppercase">
              This session
            </div>
            {session ? (
              <dl className="space-y-1.5 text-[11px]">
                <div className="grid grid-cols-2 gap-2 pb-1">
                  <SessionRankSnap
                    label="Start"
                    snap={{
                      rankScore: session.openingRankScore,
                      rankName: session.openingRankName,
                      rankDivision: session.openingRankDivision,
                      iconUrl: session.openingRankIconUrl,
                    }}
                    compact
                  />
                  <SessionRankSnap
                    label="Now"
                    snap={{
                      rankScore: session.latestRankScore,
                      rankName: session.latestRankName,
                      rankDivision: session.latestRankDivision,
                      iconUrl: session.latestRankIconUrl,
                    }}
                    compact
                  />
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground shrink-0">RP change</dt>
                  <dd className="flex justify-end text-right">
                    <RpDeltaBadge delta={sessionRpDelta} />
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground shrink-0">Session time</dt>
                  <dd className="text-muted-foreground text-right tabular-nums">
                    {formatDurationMs(elapsedMs)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground mb-0.5">Legends</dt>
                  <dd>
                    {session.legends.length === 0 ? (
                      <span className="text-muted-foreground/80">
                        None recorded
                      </span>
                    ) : (
                      <ul className="flex flex-wrap gap-1">
                        {session.legends.map((name) => {
                          const iconUrl = getLegendIconUrl(name);
                          return (
                            <li
                              key={name}
                              className="bg-muted/60 flex items-center gap-1 rounded px-1 py-0.5"
                            >
                              {iconUrl ? (
                                <img
                                  src={iconUrl}
                                  alt=""
                                  className="h-3.5 w-3.5 shrink-0 rounded-sm object-cover"
                                />
                              ) : null}
                              <span className="max-w-[7rem] truncate text-[10px]">
                                {name}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-muted-foreground text-[11px]">
                No open session in DB yet — updates on the next sync while
                you&apos;re online.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
