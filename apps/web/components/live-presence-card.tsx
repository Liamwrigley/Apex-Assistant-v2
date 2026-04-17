"use client";

import { useEffect, useState } from "react";
import { PendingLink } from "@/components/pending-link";
import {
  computeRankScoreDelta,
  RpDeltaBadge,
} from "@/components/rp-delta-badge";
import { formatDurationMs } from "@/lib/format-duration";
import { getLegendIconUrl } from "@/lib/legend-icon-url";
import { getRankIconUrl } from "@/lib/rank-icon-url";
import { evaluateRealtimePresence } from "@/lib/realtime-presence";
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
};

export type TLivePresenceSessionProps = {
  startedAt: string;
  openingRankScore: number | null;
  latestRankScore: number | null;
  openingRankName: string | null;
  openingRankDivision: string | null;
  latestRankName: string | null;
  latestRankDivision: string | null;
  legends: string[];
  gameStartedAt: string | null;
} | null;

function platformChipLabel(platform: string): string {
  const value = platform.toLowerCase();
  if (value === "origin" || value === "pc") return "PC";
  if (value === "psn" || value === "ps4") return "PS";
  if (value === "xbl" || value === "x1") return "XBOX";
  return platform.toUpperCase();
}

function isOfflineLikeStateLabel(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  const t = text.trim().toLowerCase();
  return ["offline", "afk", "disconnected", "not online"].some((frag) =>
    t.includes(frag),
  );
}

const glassPanelClass = cn(
  "rounded-lg border border-white/15 shadow-lg",
  "bg-background/78 backdrop-blur-md supports-[backdrop-filter]:bg-background/65",
);

function InlineRankSnap(props: {
  label: string;
  rankName: string | null;
  rankDivision: string | null;
  rankScore: number | null;
}) {
  const { label, rankName, rankDivision, rankScore } = props;
  const iconUrl = getRankIconUrl(rankName, rankDivision);
  const tierLine = [rankName?.trim(), rankDivision?.trim()]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="min-w-0">
      <div className="text-muted-foreground text-[9px] font-medium tracking-wide uppercase">
        {label}
      </div>
      <div className="mt-0.5 flex items-center gap-1.5">
        {iconUrl ? (
          <img
            src={iconUrl}
            alt=""
            className="h-7 w-7 shrink-0 object-contain"
          />
        ) : null}
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[10px] font-medium text-foreground">
            {tierLine || "—"}
          </div>
          <div className="text-muted-foreground tabular-nums text-[10px]">
            {rankScore !== null ? `${rankScore.toLocaleString()} RP` : "—"}
          </div>
        </div>
      </div>
    </div>
  );
}

export function LivePresenceCard(props: {
  row: TLivePresenceCardRow;
  session: TLivePresenceSessionProps;
}) {
  const { row, session } = props;
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);
  const legendIconUrl = getLegendIconUrl(row.realtimeSelectedLegend);
  const heroIconUrl =
    legendIconUrl ??
    getRankIconUrl(row.currentRankName, row.currentRankDivision);

  const evaluation = evaluateRealtimePresence({
    realtimeUpdatedAt: row.realtimeUpdatedAt,
    realtimeIsOnline: row.realtimeIsOnline,
    realtimeIsInGame: row.realtimeIsInGame,
    realtimeCurrentState: row.realtimeCurrentState,
    realtimeCurrentStateAsText: row.realtimeCurrentStateAsText,
  });
  const showInGame = evaluation.status === "in_game";

  const gameElapsedMs =
    showInGame && session?.gameStartedAt
      ? nowMs - new Date(session.gameStartedAt).getTime()
      : null;
  const gameElapsedLabel =
    gameElapsedMs !== null &&
    gameElapsedMs > 0 &&
    gameElapsedMs < 24 * 60 * 60 * 1000
      ? formatDurationMs(gameElapsedMs)
      : null;

  const sessionRpDelta = session
    ? computeRankScoreDelta(session.openingRankScore, session.latestRankScore)
    : null;
  const elapsedMs = session
    ? Math.max(0, nowMs - new Date(session.startedAt).getTime())
    : 0;

  return (
    <div className="relative isolate flex flex-col overflow-hidden rounded-lg border aspect-[3/5]">
      {/* ── Hero image (fills card, crops to fit) ── */}
      {heroIconUrl ? (
        <img
          src={heroIconUrl}
          alt={row.realtimeSelectedLegend ?? row.currentRankName ?? "Player"}
          className="absolute inset-0 h-full w-full object-cover object-top"
        />
      ) : (
        <div className="absolute inset-0 bg-muted" aria-hidden />
      )}

      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/80"
        aria-hidden
      />

      {/* ── Content overlay ── */}
      <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
        <div className="flex-1" aria-hidden />

        <div className="flex flex-none flex-col gap-1.5 p-2">
          {/* Name + status */}
          <div className={cn(glassPanelClass, "px-2.5 py-1.5")}>
            <div className="flex items-center gap-2">
              <PendingLink
                href={`/player/${row.id}`}
                className="min-w-0 truncate text-sm font-medium text-foreground hover:underline"
              >
                {row.ign}
              </PendingLink>
              <span className="flex-1" />
              {sessionRpDelta !== null ? (
                <RpDeltaBadge delta={sessionRpDelta} />
              ) : null}
            </div>

            <div className="mt-1 flex flex-wrap gap-1">
              <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] text-violet-700 dark:text-violet-300">
                {platformChipLabel(row.platform)}
              </span>
              {showInGame ? (
                <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-800 dark:text-emerald-300">
                  In game
                  {gameElapsedLabel ? ` · ${gameElapsedLabel}` : ""}
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
            </div>
          </div>

          {/* Session info */}
          {session ? (
            <div className={cn(glassPanelClass, "px-2.5 py-1.5")}>
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                  Session
                </span>
                <span className="text-muted-foreground tabular-nums text-[11px]">
                  {formatDurationMs(elapsedMs)}
                </span>
              </div>

              <div className="mt-1 flex items-end justify-between gap-2">
                <InlineRankSnap
                  label="Start"
                  rankName={session.openingRankName}
                  rankDivision={session.openingRankDivision}
                  rankScore={session.openingRankScore}
                />
                <InlineRankSnap
                  label="Now"
                  rankName={session.latestRankName}
                  rankDivision={session.latestRankDivision}
                  rankScore={session.latestRankScore}
                />
              </div>

              {session.legends.length > 0 ? (
                <ul className="mt-1.5 flex flex-wrap gap-1">
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
                            className="h-3.5 w-3.5 shrink-0 rounded-sm object-cover object-top"
                          />
                        ) : null}
                        <span className="max-w-[7rem] truncate text-[10px]">
                          {name}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
