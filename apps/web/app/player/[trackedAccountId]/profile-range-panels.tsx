"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PlayerTimelineSparkline } from "@/components/player-timeline-sparkline";
import { RpDeltaBadge } from "@/components/rp-delta-badge";
import { getLegendIconUrl } from "@/lib/legend-icon-url";
import { useCallback, useMemo, useState } from "react";
import type { TMapLegendAggregate } from "@apex-assistant/db";
import { useProfileRange } from "./profile-range-context";

export function PlayerProfileLatestRpInline() {
  const { timelinePoints } = useProfileRange();
  const latestScore =
    timelinePoints.length > 0 ? timelinePoints[timelinePoints.length - 1].rankScore : null;
  if (latestScore === null) return null;
  return (
    <span className="text-muted-foreground text-[11px] tabular-nums">
      · {latestScore.toLocaleString()} RP
    </span>
  );
}

export function PlayerProfileHeroImage(props: {
  isOnline: boolean;
  lastSeenLegendUrl: string | null;
  currentRankIconUrl: string | null;
  alt: string;
}) {
  const { legendAggregates } = useProfileRange();
  const mostPlayed = legendAggregates[0] ?? null;
  const mostPlayedUrl = mostPlayed ? getLegendIconUrl(mostPlayed.legend) : null;
  const heroIconUrl = useMemo(() => {
    if (props.isOnline && props.lastSeenLegendUrl) return props.lastSeenLegendUrl;
    if (mostPlayedUrl) return mostPlayedUrl;
    if (props.lastSeenLegendUrl) return props.lastSeenLegendUrl;
    return props.currentRankIconUrl;
  }, [mostPlayedUrl, props.currentRankIconUrl, props.isOnline, props.lastSeenLegendUrl]);

  return heroIconUrl ? (
    <img
      src={heroIconUrl}
      alt={props.alt}
      className="absolute inset-0 h-full w-full object-cover object-top"
    />
  ) : (
    <div className="absolute inset-0 bg-muted" aria-hidden />
  );
}

export function PlayerProfileRangeStatsCareer() {
  const {
    rangeKey,
    legendAggregates,
    mapAggregates,
    careerDeltas,
    rangeLoading,
    timelinePoints,
    trackerRows,
    selectedLegend,
    hasTrackerObservations,
    legacyApiSummary,
  } = useProfileRange();

  /** Matches the RP sparkline: last snapshot minus first in this range (rank_snapshots), not inferred segment sums. */
  const netRpDelta = useMemo(() => {
    if (timelinePoints.length < 2) return null;
    const first = timelinePoints[0]!.rankScore;
    const last = timelinePoints[timelinePoints.length - 1]!.rankScore;
    const d = last - first;
    return Number.isFinite(d) ? d : null;
  }, [timelinePoints]);

  const mostPlayedLegend = legendAggregates.length > 0 ? legendAggregates[0] : null;
  const mostPlayedLegendIconUrl = mostPlayedLegend ? getLegendIconUrl(mostPlayedLegend.legend) : null;

  const bestLegend =
    legendAggregates.length > 0
      ? [...legendAggregates].sort((a, b) => {
          if (b.avgRpDelta !== a.avgRpDelta) return b.avgRpDelta - a.avgRpDelta;
          return b.games - a.games;
        })[0]
      : null;
  const bestLegendIconUrl = bestLegend ? getLegendIconUrl(bestLegend.legend) : null;

  const bestMap =
    mapAggregates.length > 0
      ? [...mapAggregates].sort((a, b) => {
          if (b.totalRpDelta !== a.totalRpDelta) return b.totalRpDelta - a.totalRpDelta;
          if (b.games !== a.games) return b.games - a.games;
          return b.avgRpDelta - a.avgRpDelta;
        })[0]
      : null;

  const totalGames = legendAggregates.reduce((s, r) => s + r.games, 0);

  const hasLegacyNumbers =
    legacyApiSummary != null &&
    (legacyApiSummary.kills != null ||
      legacyApiSummary.damage != null ||
      legacyApiSummary.wins != null);

  const showTrackerCard =
    trackerRows.length > 0 ||
    hasTrackerObservations ||
    Boolean(selectedLegend?.trim()) ||
    hasLegacyNumbers;

  return (
    <>
      <div
        className={`grid grid-cols-2 gap-3 sm:grid-cols-4 ${rangeLoading ? "opacity-70" : ""} transition-opacity`}
        aria-busy={rangeLoading}
      >
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardHeader className="space-y-1 p-2.5">
            <CardDescription className="text-[11px] leading-none">Games ({rangeKey})</CardDescription>
            <CardTitle className="flex flex-col items-start gap-0.5 text-lg font-semibold leading-tight">
              <span className="tabular-nums">{totalGames}</span>
              <span className="text-muted-foreground flex w-full items-center justify-between gap-1.5 text-xs font-normal tabular-nums">
                <span>Net RP</span>
                <RpDeltaBadge delta={netRpDelta} />
              </span>
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-cyan-500/20 bg-cyan-500/5">
          <CardHeader className="space-y-1 p-2.5">
            <CardDescription className="text-[11px] leading-none">Best map ({rangeKey})</CardDescription>
            <CardTitle className="flex flex-col items-start gap-0.5 text-lg font-semibold leading-tight">
              {bestMap ? (
                <>
                  <span className="min-w-0 truncate">{bestMap.mapName}</span>
                  <span className="text-muted-foreground flex w-full items-center justify-between gap-1.5 text-xs font-normal tabular-nums">
                    <span>
                      {bestMap.games} game{bestMap.games !== 1 ? "s" : ""}
                    </span>
                    <RpDeltaBadge delta={bestMap.totalRpDelta} />
                  </span>
                </>
              ) : (
                "—"
              )}
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
                      <img
                        src={bestLegendIconUrl}
                        alt=""
                        className="h-5 w-5 shrink-0 rounded-sm object-cover"
                      />
                    ) : null}
                    <span className="truncate">{bestLegend.legend}</span>
                  </span>
                  <span className="text-muted-foreground flex items-center gap-1.5 justify-between w-full text-xs font-normal tabular-nums">
                    <span>{bestLegend.games} game{bestLegend.games !== 1 ? "s" : ""}</span>
                    <RpDeltaBadge delta={bestLegend.totalRpDelta} />
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
                  <span className="text-muted-foreground flex items-center gap-1.5 justify-between w-full text-xs font-normal tabular-nums">
                    <span>
                      {mostPlayedLegend.games} game{mostPlayedLegend.games !== 1 ? "s" : ""}
                    </span>
                    <RpDeltaBadge delta={mostPlayedLegend.totalRpDelta} />
                  </span>
                </>
              ) : (
                "—"
              )}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {showTrackerCard ? (
        <Card
          className={`border-border/80 bg-muted/25 ${rangeLoading ? "opacity-70" : ""} transition-opacity`}
        >
          <CardHeader className="space-y-1 pb-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="text-base">
                  {selectedLegend ? (
                    <>Equipped trackers · <span className="text-muted-foreground font-normal">{selectedLegend}</span></>
                  ) : (
                    "Equipped trackers"
                  )}
                </CardTitle>
              </div>
              <div className="group relative shrink-0">
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground flex h-5 w-5 items-center justify-center rounded-full border border-border/60 text-[10px] font-semibold transition-colors"
                  aria-label="About equipped trackers"
                >
                  i
                </button>
                <div className="pointer-events-none absolute right-0 top-full z-50 mt-1.5 w-64 rounded-md border bg-popover p-3 text-xs text-popover-foreground opacity-0 shadow-md transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                  Values come from the API for your selected legend&apos;s tracker slots. They are not full
                  account-wide career totals. Equip the trackers you care about on that legend to see them here.
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {trackerRows.length > 0 ? (
              <div className="space-y-4">
                {Array.from({ length: Math.ceil(trackerRows.length / 3) }, (_, chunkIdx) => {
                  const start = chunkIdx * 3;
                  const chunk = trackerRows.slice(start, start + 3);
                  return (
                    <div
                      key={start}
                      className={chunkIdx > 0 ? "border-border/60 border-t pt-4" : undefined}
                    >
                      <div className="grid grid-cols-3 divide-x divide-border/60">
                        {chunk.map((row, i) => {
                          const colPad =
                            i === 0
                              ? "min-w-0 pr-3 sm:pr-6"
                              : i === 1
                                ? "min-w-0 px-3 sm:px-6"
                                : "min-w-0 pl-3 sm:pl-6";
                          return (
                            <div key={`${row.trackerKey}-${row.dataIndex}`} className={colPad}>
                              <p className="text-muted-foreground text-[11px] tracking-wide">
                                {row.displayName}
                              </p>
                              <p className="mt-0.5 truncate text-lg font-semibold tracking-tight tabular-nums sm:text-xl">
                                {row.value.toLocaleString()}
                              </p>
                              <div className="mt-1">
                                <RpDeltaBadge delta={row.delta} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                {!hasTrackerObservations
                  ? "No tracker data yet — stats appear after the next sync."
                  : selectedLegend?.trim()
                    ? "No data for this legend yet."
                    : "Select a legend in-game to see tracker stats."}
              </p>
            )}

            {hasLegacyNumbers ? (
              <div className="border-border/60 border-t pt-4">
                <div className="grid grid-cols-3 divide-x divide-border/60">
                  <div className="min-w-0 pr-3 sm:pr-6">
                    <p className="text-muted-foreground text-[11px] tracking-wide">Kills</p>
                    <p className="mt-0.5 truncate text-lg font-semibold tracking-tight tabular-nums sm:text-xl">
                      {legacyApiSummary?.kills?.toLocaleString() ?? "—"}
                    </p>
                    <div className="mt-1">
                      <RpDeltaBadge delta={careerDeltas.deltaKills} />
                    </div>
                  </div>
                  <div className="min-w-0 px-3 sm:px-6">
                    <p className="text-muted-foreground text-[11px] tracking-wide">Damage</p>
                    <p className="mt-0.5 truncate text-lg font-semibold tracking-tight tabular-nums sm:text-xl">
                      {legacyApiSummary?.damage?.toLocaleString() ?? "—"}
                    </p>
                    <div className="mt-1">
                      <RpDeltaBadge delta={careerDeltas.deltaDamage} />
                    </div>
                  </div>
                  <div className="min-w-0 pl-3 sm:pl-6">
                    <p className="text-muted-foreground text-[11px] tracking-wide">Wins</p>
                    <p className="mt-0.5 truncate text-lg font-semibold tracking-tight tabular-nums sm:text-xl">
                      {legacyApiSummary?.wins?.toLocaleString() ?? "—"}
                    </p>
                    <div className="mt-1">
                      <RpDeltaBadge delta={careerDeltas.deltaWins} />
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

export function PlayerProfileRangeTimelineTables(props: { trackedAccountId: string }) {
  const { rangeKey, timelinePoints, legendAggregates, mapAggregates, rangeLoading } = useProfileRange();

  return (
    <>
      <Card className={rangeLoading ? "opacity-70 transition-opacity" : ""}>
        <CardHeader>
          <CardTitle>RP Timeline</CardTitle>
          <CardDescription>Rank score over the selected time range.</CardDescription>
        </CardHeader>
        <CardContent>
          {timelinePoints.length >= 2 ? (
            <PlayerTimelineSparkline
              trackedAccountId={props.trackedAccountId}
              points={timelinePoints}
              variant="profile"
            />
          ) : (
            <p className="text-muted-foreground text-sm">Not enough data for a timeline.</p>
          )}
        </CardContent>
      </Card>

      <Card className={rangeLoading ? "opacity-70 transition-opacity" : ""}>
        <CardHeader>
          <CardTitle>Legend Performance</CardTitle>
          <CardDescription>Aggregated RP per legend ({rangeKey}).</CardDescription>
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
                    <th className="px-2 py-2 font-medium text-right">Avg Kills</th>
                    <th className="px-2 py-2 font-medium text-right">Avg Dmg</th>
                    <th className="px-2 py-2 font-medium text-right">+ve / -ve</th>
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
                          <RpDeltaBadge delta={row.avgRpDelta} decimals={1} />
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {row.totalKills > 0 ? row.avgKills : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {row.totalDamage > 0 ? row.avgDamage.toLocaleString() : <span className="text-muted-foreground">—</span>}
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

      <MapPerformanceCard rangeLoading={rangeLoading} />
    </>
  );
}

type TMapSortField = "games" | "totalRpDelta" | "avgRpDelta";

function MapPerformanceCard(props: { rangeLoading: boolean }) {
  const { rangeKey, mapAggregates, mapLegendAggregates } = useProfileRange();
  const [sortField, setSortField] = useState<TMapSortField>("totalRpDelta");
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedMaps, setExpandedMaps] = useState<Set<string>>(() => new Set());

  const handleSort = useCallback((field: TMapSortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortAsc((a) => !a);
      } else {
        setSortAsc(false);
      }
      return field;
    });
  }, []);

  const sortedMaps = useMemo(() => {
    const rows = [...mapAggregates];
    rows.sort((a, b) => {
      const va = a[sortField];
      const vb = b[sortField];
      return sortAsc ? va - vb : vb - va;
    });
    return rows;
  }, [mapAggregates, sortField, sortAsc]);

  const legendsByMap = useMemo(() => {
    const map = new Map<string, TMapLegendAggregate[]>();
    for (const row of mapLegendAggregates) {
      const arr = map.get(row.mapName) ?? [];
      arr.push(row);
      map.set(row.mapName, arr);
    }
    return map;
  }, [mapLegendAggregates]);

  const sortArrow = (field: TMapSortField) =>
    sortField === field ? (sortAsc ? " ▴" : " ▾") : "";

  return (
    <Card className={props.rangeLoading ? "opacity-70 transition-opacity" : ""}>
      <CardHeader>
        <CardTitle>Map Performance</CardTitle>
        <CardDescription>
          RP breakdown by ranked map ({rangeKey}). Click maps to show per-legend stats — multiple maps can be open at once.
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
                  <th
                    className="px-2 py-2 font-medium text-right cursor-pointer select-none hover:text-foreground"
                    onClick={() => handleSort("games")}
                  >
                    Games{sortArrow("games")}
                  </th>
                  <th
                    className="px-2 py-2 font-medium text-right cursor-pointer select-none hover:text-foreground"
                    onClick={() => handleSort("totalRpDelta")}
                  >
                    Total RP{sortArrow("totalRpDelta")}
                  </th>
                  <th
                    className="px-2 py-2 font-medium text-right cursor-pointer select-none hover:text-foreground"
                    onClick={() => handleSort("avgRpDelta")}
                  >
                    Avg RP{sortArrow("avgRpDelta")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedMaps.map((row) => {
                  const isExpanded = expandedMaps.has(row.mapName);
                  const legends = legendsByMap.get(row.mapName) ?? [];
                  return (
                    <MapRow
                      key={row.mapName}
                      mapName={row.mapName}
                      games={row.games}
                      totalRpDelta={row.totalRpDelta}
                      avgRpDelta={row.avgRpDelta}
                      isExpanded={isExpanded}
                      legends={legends}
                      onToggle={() =>
                        setExpandedMaps((prev) => {
                          const next = new Set(prev);
                          if (next.has(row.mapName)) {
                            next.delete(row.mapName);
                          } else {
                            next.add(row.mapName);
                          }
                          return next;
                        })
                      }
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type TLegendSortField = "games" | "totalRpDelta" | "avgRpDelta" | "avgKills" | "avgDamage";

function MapRow(props: {
  mapName: string;
  games: number;
  totalRpDelta: number;
  avgRpDelta: number;
  isExpanded: boolean;
  legends: TMapLegendAggregate[];
  onToggle: () => void;
}) {
  const [legendSort, setLegendSort] = useState<TLegendSortField>("totalRpDelta");
  const [legendSortAsc, setLegendSortAsc] = useState(false);

  const handleLegendSort = useCallback((field: TLegendSortField) => {
    setLegendSort((prev) => {
      if (prev === field) {
        setLegendSortAsc((a) => !a);
      } else {
        setLegendSortAsc(false);
      }
      return field;
    });
  }, []);

  const sortedLegends = useMemo(() => {
    const rows = [...props.legends];
    rows.sort((a, b) => {
      const va = a[legendSort];
      const vb = b[legendSort];
      if (typeof va === "number" && typeof vb === "number") {
        return legendSortAsc ? va - vb : vb - va;
      }
      return 0;
    });
    return rows;
  }, [props.legends, legendSort, legendSortAsc]);

  const legendArrow = (field: TLegendSortField) =>
    legendSort === field ? (legendSortAsc ? " ▴" : " ▾") : "";

  return (
    <>
      <tr
        className="border-border/60 border-b cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={props.onToggle}
      >
        <td className="px-2 py-2 font-medium">
          <span className="inline-flex items-center gap-1.5">
            <span className="text-muted-foreground text-[10px] w-3 text-center">{props.isExpanded ? "▾" : "▸"}</span>
            {props.mapName}
          </span>
        </td>
        <td className="px-2 py-2 text-right tabular-nums">{props.games}</td>
        <td className="px-2 py-2 text-right">
          <RpDeltaBadge delta={props.totalRpDelta} />
        </td>
        <td className="px-2 py-2 text-right">
          <RpDeltaBadge delta={props.avgRpDelta} decimals={1} />
        </td>
      </tr>
      {props.isExpanded && sortedLegends.length > 0 ? (
        <tr className="border-border/60 border-b">
          <td colSpan={4} className="p-0">
            <div className="bg-muted/5">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b border-border/40 text-[10px]">
                    <th className="pl-8 pr-2 py-1.5 font-medium">Legend</th>
                    <th
                      className="px-2 py-1.5 font-medium text-right cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={(e) => { e.stopPropagation(); handleLegendSort("games"); }}
                    >
                      Games{legendArrow("games")}
                    </th>
                    <th
                      className="px-2 py-1.5 font-medium text-right cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={(e) => { e.stopPropagation(); handleLegendSort("totalRpDelta"); }}
                    >
                      Total RP{legendArrow("totalRpDelta")}
                    </th>
                    <th
                      className="px-2 py-1.5 font-medium text-right cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={(e) => { e.stopPropagation(); handleLegendSort("avgRpDelta"); }}
                    >
                      Avg RP{legendArrow("avgRpDelta")}
                    </th>
                    <th
                      className="px-2 py-1.5 font-medium text-right cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={(e) => { e.stopPropagation(); handleLegendSort("avgKills"); }}
                    >
                      Avg Kills{legendArrow("avgKills")}
                    </th>
                    <th
                      className="px-2 py-1.5 font-medium text-right cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={(e) => { e.stopPropagation(); handleLegendSort("avgDamage"); }}
                    >
                      Avg Dmg{legendArrow("avgDamage")}
                    </th>
                    <th className="px-2 py-1.5 font-medium text-right">+ve / -ve</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedLegends.map((leg) => {
                    const iconUrl = getLegendIconUrl(leg.legend);
                    return (
                      <tr key={leg.legend} className="border-b border-border/20 last:border-0">
                        <td className="pl-8 pr-2 py-1.5">
                          <span className="inline-flex items-center gap-1.5">
                            {iconUrl ? (
                              <img src={iconUrl} alt="" className="h-4 w-4 rounded-sm object-cover" />
                            ) : null}
                            <span className="font-medium">{leg.legend}</span>
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{leg.games}</td>
                        <td className="px-2 py-1.5 text-right">
                          <RpDeltaBadge delta={leg.totalRpDelta} />
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <RpDeltaBadge delta={leg.avgRpDelta} decimals={1} />
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {leg.totalKills > 0 ? leg.avgKills : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {leg.totalDamage > 0 ? leg.avgDamage.toLocaleString() : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="text-muted-foreground px-2 py-1.5 text-right tabular-nums">
                          {leg.wins} / {leg.losses}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
