"use client";

import { useMemo, useState } from "react";
import { PlayerTimelineSparkline } from "@/components/player-timeline-sparkline";

type TLeaderboardRow = {
  trackedAccountId: string;
  ign: string;
  platform: string;
  rankScore: number;
  rankName: string;
  deltaRp24h: number | null;
};
type TTimelinePoint = { capturedAt: string; rankScore: number };

type TSortKey = "ign" | "platform" | "rankName" | "rankScore" | "deltaRp24h";
type TSortDir = "asc" | "desc";
type TPlatformFilter = "all" | "origin" | "psn" | "xbl";

function sortIndicator(active: boolean, dir: TSortDir): string {
  if (!active) {
    return " ";
  }
  return dir === "asc" ? " \u2191" : " \u2193";
}

export function LeaderboardTable(props: { rows: TLeaderboardRow[]; timelines: Record<string, TTimelinePoint[]> }) {
  const [sortKey, setSortKey] = useState<TSortKey>("rankScore");
  const [sortDir, setSortDir] = useState<TSortDir>("desc");
  const [platformFilter, setPlatformFilter] = useState<TPlatformFilter>("all");

  function normalizePlatform(platform: string): TPlatformFilter {
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

  function platformLabel(platform: string): string {
    const normalized = normalizePlatform(platform);
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
      if (platformFilter === "all") {
        return true;
      }
      return normalizePlatform(row.platform) === platformFilter;
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
  }, [platformFilter, props.rows, sortDir, sortKey]);

  return (
    <div className="overflow-x-auto rounded-lg border">
      <div className="bg-muted/20 flex items-center justify-end border-b px-3 py-2">
        <label className="text-muted-foreground mr-2 text-xs">Platform</label>
        <select
          className="bg-background border-input rounded border px-2 py-1 text-xs"
          value={platformFilter}
          onChange={(event) => setPlatformFilter(event.target.value as TPlatformFilter)}
        >
          <option value="all">All</option>
          <option value="origin">PC</option>
          <option value="psn">PS4</option>
          <option value="xbl">X1</option>
        </select>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr className="text-left">
            <th className="whitespace-nowrap px-3 py-2.5 font-medium" title="Leaderboard position by current sort order">
              #
            </th>
            <th className="whitespace-nowrap px-3 py-2.5 font-medium" title="Tracked player IGN and platform">
              <button className="hover:text-foreground text-left" onClick={() => onSort("ign")} type="button">
                Player{sortIndicator(sortKey === "ign", sortDir)}
              </button>
            </th>
            <th className="whitespace-nowrap px-3 py-2.5 font-medium" title="Latest rank tier and current RP">
              <button className="hover:text-foreground text-left" onClick={() => onSort("rankScore")} type="button">
                Rank{sortIndicator(sortKey === "rankScore", sortDir)}
              </button>
            </th>
            <th className="whitespace-nowrap px-3 py-2.5 font-medium text-right" title="Rolling 24-hour RP change">
              <button className="hover:text-foreground text-right" onClick={() => onSort("deltaRp24h")} type="button">
                24h Delta{sortIndicator(sortKey === "deltaRp24h", sortDir)}
              </button>
            </th>
            <th className="w-full px-3 py-2.5 font-medium" title="7-day RP sparkline. Hover to scrub point values.">
              7d Trend
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, index) => (
            <tr key={row.trackedAccountId} className="border-t">
              <td className="px-3 py-3 align-middle">{index + 1}</td>
              <td className="px-3 py-3 align-middle">
                <div className="flex min-w-0 flex-col gap-1 leading-tight">
                  <span className="truncate font-medium" title={row.ign}>
                    {row.ign}
                  </span>
                  <span
                    className="inline-flex w-fit items-center rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] uppercase text-cyan-300"
                    title={row.platform}
                  >
                    {platformLabel(row.platform)}
                  </span>
                </div>
              </td>
              <td className="px-3 py-3 align-middle">
                <div className="flex min-w-0 flex-col gap-0.5 leading-tight">
                  <span className="truncate" title={row.rankName}>
                    {row.rankName}
                  </span>
                  <span className="text-muted-foreground whitespace-nowrap text-xs">{row.rankScore.toLocaleString()} RP</span>
                </div>
              </td>
              <td className="px-3 py-3 text-right align-middle">
                {typeof row.deltaRp24h === "number" ? (
                  <span
                    className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${
                      row.deltaRp24h > 0
                        ? "bg-emerald-500/15 text-emerald-300"
                        : row.deltaRp24h < 0
                          ? "bg-rose-500/15 text-rose-300"
                          : "text-muted-foreground"
                    }`}
                  >
                    {row.deltaRp24h > 0 ? (
                      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-3.5 w-3.5">
                        <path d="M10 3l5 6h-3v8H8V9H5l5-6z" />
                      </svg>
                    ) : null}
                    {row.deltaRp24h < 0 ? (
                      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-3.5 w-3.5">
                        <path d="M10 17l-5-6h3V3h4v8h3l-5 6z" />
                      </svg>
                    ) : null}
                    <span>
                      {row.deltaRp24h > 0 ? "+" : ""}
                      {row.deltaRp24h.toLocaleString()}
                    </span>
                  </span>
                ) : (
                  ""
                )}
              </td>
              <td className="w-full px-3 py-3 align-middle" title="7-day RP trend. Tooltip shows hourly timestamp.">
                <div className="flex justify-start">
                  <PlayerTimelineSparkline
                    trackedAccountId={row.trackedAccountId}
                    hours={168}
                    points={props.timelines[row.trackedAccountId] ?? []}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
