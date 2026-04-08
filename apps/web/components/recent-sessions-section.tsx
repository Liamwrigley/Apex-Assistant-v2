"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDurationMs } from "@/lib/format-duration";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { computeRankScoreDelta, RpDeltaBadge } from "@/components/rp-delta-badge";
import { getLegendIconUrl } from "@/lib/legend-icon-url";
import { SessionRankSnap, type TSessionRankSnap } from "@/components/session-rank-snap";

export type TEstimatedGame = {
  legend: string | null;
  rpDelta: number | null;
  confidence: string;
  mergeRisk: boolean;
};

export type TRecentSessionRow = {
  sessionId: string;
  trackedAccountId?: string;
  ign: string;
  platform: string;
  startedAt: string;
  endedAt: string;
  openingRankScore: number | null;
  latestRankScore: number | null;
  openingRankName: string | null;
  openingRankDivision: string | null;
  openingRankIconUrl: string | null;
  latestRankName: string | null;
  latestRankDivision: string | null;
  latestRankIconUrl: string | null;
  legends: string[];
  estimatedGames?: TEstimatedGame[];
};

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

const confidenceBg: Record<string, string> = {
  high: "bg-green-500/20 text-green-300",
  medium: "bg-yellow-500/20 text-yellow-300",
  low: "bg-red-500/20 text-red-300",
};

function EstimatedGamesCell(props: { games?: TEstimatedGame[] }) {
  const games = props.games ?? [];
  if (games.length === 0) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs tabular-nums">{games.length} game{games.length !== 1 ? "s" : ""}</span>
      <div className="flex flex-wrap gap-1">
        {games.map((g, i) => (
          <span
            key={i}
            className={`inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] ${confidenceBg[g.confidence] ?? "bg-muted/60"}`}
            title={`${g.legend ?? "?"} | RP: ${g.rpDelta ?? "?"} | ${g.confidence}${g.mergeRisk ? " | merge risk" : ""}`}
          >
            <span className="max-w-[4rem] truncate">{g.legend ?? "?"}</span>
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
  );
}

function toSnap(
  score: number | null,
  name: string | null,
  division: string | null,
  icon: string | null
): TSessionRankSnap {
  return { rankScore: score, rankName: name, rankDivision: division, iconUrl: icon };
}

const DAY_MS = 86_400_000;
const INITIAL_VISIBLE_DAYS = 2;
const LOAD_MORE_DAYS = 2;

export function RecentSessionsSection(props: { rows: TRecentSessionRow[] }) {
  const [visibleDays, setVisibleDays] = useState(INITIAL_VISIBLE_DAYS);

  const { visibleRows, hasOlderOnFile } = useMemo(() => {
    const rows = props.rows;
    if (rows.length === 0) {
      return { visibleRows: [] as TRecentSessionRow[], hasOlderOnFile: false };
    }
    const cutoff = Date.now() - visibleDays * DAY_MS;
    const visible = rows.filter(
      (r) => new Date(r.endedAt).getTime() >= cutoff
    );
    return {
      visibleRows: visible,
      hasOlderOnFile: visible.length < rows.length,
    };
  }, [props.rows, visibleDays]);

  if (props.rows.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent sessions</CardTitle>
        <CardDescription>
          Completed play sessions per tracked player (rank at start vs end, RP change, and
          legends while active).
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-xs">
              <th className="px-2 py-2 font-medium">Player</th>
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
            {visibleRows.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="text-muted-foreground px-2 py-6 text-center text-sm"
                >
                  No sessions ended in the last {visibleDays} days.
                  {hasOlderOnFile ? " Load more days to see older sessions." : null}
                </td>
              </tr>
            ) : null}
            {visibleRows.map((row) => {
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
              return (
                <tr key={row.sessionId} className="border-border/60 border-b last:border-0">
                  <td className="px-2 py-2 align-top">
                    {row.trackedAccountId ? (
                      <Link href={`/player/${row.trackedAccountId}`} className="font-medium hover:underline">
                        {row.ign}
                      </Link>
                    ) : (
                      <div className="font-medium">{row.ign}</div>
                    )}
                    <span className="text-muted-foreground mt-0.5 inline-block rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] text-violet-300">
                      {platformChipLabel(row.platform)}
                    </span>
                  </td>
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
                    <EstimatedGamesCell games={row.estimatedGames} />
                  </td>
                  <td className="text-muted-foreground px-2 py-2 align-middle tabular-nums">
                    {formatDurationMs(durationMs)}
                  </td>
                  <td className="text-muted-foreground px-2 py-2 text-right align-middle text-xs">
                    Finished {formatRelativeTime(row.endedAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {hasOlderOnFile ? (
          <div className="mt-4 flex flex-col items-center gap-2 border-t border-border/60 pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setVisibleDays((d) => d + LOAD_MORE_DAYS)}
            >
              Show {LOAD_MORE_DAYS} more days
            </Button>
            <p className="text-muted-foreground text-center text-xs">
              {props.rows.length - visibleRows.length} older session
              {props.rows.length - visibleRows.length !== 1 ? "s" : ""} not shown yet
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
