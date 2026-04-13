"use client";

import { useMemo, useState } from "react";
import { PendingLink } from "@/components/pending-link";
import { PlayerTimelineSparkline } from "@/components/player-timeline-sparkline";
import { getRankIconUrl } from "@/lib/rank-icon-url";
import { RpDeltaBadge } from "@/components/rp-delta-badge";

type TLeaderboardRow = {
  trackedAccountId: string;
  ign: string;
  platform: string;
  rankScore: number;
  rankName: string;
  rankDivision: string | null;
  deltaRp24h: number | null;
};
type TTimelinePoint = { capturedAt: string; rankScore: number };

type TSortKey = "ign" | "platform" | "rankName" | "rankScore" | "deltaRp24h";
type TSortDir = "asc" | "desc";
export type TPlatformFilter = "all" | "origin" | "psn" | "xbl";

function sortIndicator(active: boolean, dir: TSortDir): string {
  if (!active) {
    return " ";
  }
  return dir === "asc" ? " \u2191" : " \u2193";
}

export function toPlatformFilter(platform: string): TPlatformFilter {
  const value = platform.toLowerCase();
  if (value === "origin" || value === "pc") {
    return "origin";
  }
  if (value === "psn" || value === "ps4") {
    return "psn";
  }
  if (value === "xbl" || value === "x1") {
    return "xbl";
  }
  return "all";
}

export function platformLabel(platform: string): string {
  const normalized = toPlatformFilter(platform);
  if (normalized === "origin") {
    return "PC";
  }
  if (normalized === "psn") {
    return "PS4";
  }
  if (normalized === "xbl") {
    return "X1";
  }
  return platform.toUpperCase();
}

export function LeaderboardTable(props: {
  rows: TLeaderboardRow[];
  timelines: Record<string, TTimelinePoint[]>;
  platformFilter: TPlatformFilter;
}) {
  const [sortKey, setSortKey] = useState<TSortKey>("rankScore");
  const [sortDir, setSortDir] = useState<TSortDir>("desc");

  function onSort(nextKey: TSortKey) {
    if (sortKey === nextKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDir(nextKey === "rankScore" ? "desc" : "asc");
  }

  const sortedRows = useMemo(() => {
    const data = props.rows.filter((row) => {
      if (props.platformFilter === "all") {
        return true;
      }
      return toPlatformFilter(row.platform) === props.platformFilter;
    });
    data.sort((a, b) => {
      const direction = sortDir === "asc" ? 1 : -1;
      if (sortKey === "rankScore") {
        return (a.rankScore - b.rankScore) * direction;
      }
      if (sortKey === "deltaRp24h") {
        return ((a.deltaRp24h ?? -Infinity) - (b.deltaRp24h ?? -Infinity)) * direction;
      }
      if (sortKey === "ign") {
        return a.ign.localeCompare(b.ign) * direction;
      }
      if (sortKey === "platform") {
        return a.platform.localeCompare(b.platform) * direction;
      }
      return a.rankName.localeCompare(b.rankName) * direction;
    });
    return data;
  }, [props.platformFilter, props.rows, sortDir, sortKey]);

  /** One shared x-axis for all visible sparklines so the same wall time lines up row-to-row. */
  const timelineXDomain = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const row of sortedRows) {
      const pts = props.timelines[row.trackedAccountId] ?? [];
      for (const p of pts) {
        const t = new Date(p.capturedAt).getTime();
        if (Number.isFinite(t)) {
          min = Math.min(min, t);
          max = Math.max(max, t);
        }
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return null;
    }
    if (min === max) {
      return { minMs: min - 60_000, maxMs: max + 60_000 };
    }
    return { minMs: min, maxMs: max };
  }, [props.timelines, sortedRows]);

  return (
    <table className="w-full min-w-[760px] text-left text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-xs">
            <th className="whitespace-nowrap px-2 py-2 font-medium" title="Leaderboard position by current sort order">
              #
            </th>
            <th className="whitespace-nowrap px-2 py-2 font-medium" title="Tracked player IGN and platform">
              <button className="hover:text-foreground text-left" onClick={() => onSort("ign")} type="button">
                Player{sortIndicator(sortKey === "ign", sortDir)}
              </button>
            </th>
            <th className="whitespace-nowrap px-2 py-2 font-medium" title="Latest rank tier and current RP">
              <button className="hover:text-foreground text-left" onClick={() => onSort("rankScore")} type="button">
                Rank{sortIndicator(sortKey === "rankScore", sortDir)}
              </button>
            </th>
            <th className="whitespace-nowrap px-2 py-2 text-right font-medium" title="Rolling 24-hour RP change">
              <button className="hover:text-foreground inline-block w-full text-right" onClick={() => onSort("deltaRp24h")} type="button">
                24h Delta{sortIndicator(sortKey === "deltaRp24h", sortDir)}
              </button>
            </th>
            <th className="w-full px-2 py-2 font-medium" title="7-day RP sparkline. Hover to scrub point values.">
              7d Trend
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, index) => (
            <tr key={row.trackedAccountId} className="border-border/60 border-b last:border-0">
              <td className="px-2 py-2 align-middle">{index + 1}</td>
              <td className="px-2 py-2 align-middle">
                <div className="flex min-w-0 flex-col gap-1 leading-tight">
                  <PendingLink
                    href={`/player/${row.trackedAccountId}`}
                    className="truncate font-medium hover:underline"
                    title={row.ign}
                  >
                    {row.ign}
                  </PendingLink>
                  <span
                    className="inline-flex w-fit items-center rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] uppercase text-cyan-300"
                    title={row.platform}
                  >
                    {platformLabel(row.platform)}
                  </span>
                </div>
              </td>
              <td className="px-2 py-2 align-middle">
                <div className="flex min-w-0 items-start gap-2 leading-tight">
                  {getRankIconUrl(row.rankName, row.rankDivision) ? (
                    <img
                      src={getRankIconUrl(row.rankName, row.rankDivision)!}
                      alt=""
                      className="mt-0.5 h-8 w-8 shrink-0 object-contain"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <span className="truncate" title={row.rankName}>
                      {row.rankName}
                      {row.rankDivision ? ` ${row.rankDivision}` : ""}
                    </span>
                    <span className="text-muted-foreground block whitespace-nowrap text-xs">
                      {row.rankScore.toLocaleString()} RP
                    </span>
                  </div>
                </div>
              </td>
              <td className="px-2 py-2 text-right align-middle">
                {typeof row.deltaRp24h === "number" ? (
                  <RpDeltaBadge delta={row.deltaRp24h} />
                ) : (
                  ""
                )}
              </td>
              <td
                className="w-full overflow-visible px-2 py-2 align-middle"
                title="7-day RP trend. Tooltip shows hourly timestamp."
              >
                <div className="flex justify-start overflow-visible">
                  <PlayerTimelineSparkline
                    trackedAccountId={row.trackedAccountId}
                    hours={168}
                    points={props.timelines[row.trackedAccountId] ?? []}
                    xDomain={timelineXDomain}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
    </table>
  );
}
