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

type TAccountCareer = {
  careerKills: number | null;
  careerDamage: number | null;
  careerWins: number | null;
};

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

export function PlayerProfileRangeStatsCareer(props: { account: TAccountCareer }) {
  const { rangeKey, legendAggregates, careerDeltas, rangeLoading } = useProfileRange();

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

  const totalGames = legendAggregates.reduce((s, r) => s + r.games, 0);
  const totalRpDelta = legendAggregates.reduce((s, r) => s + r.totalRpDelta, 0);

  const showCareer =
    props.account.careerKills !== null ||
    props.account.careerDamage !== null ||
    props.account.careerWins !== null;

  return (
    <>
      <div
        className={`grid grid-cols-2 gap-3 sm:grid-cols-4 ${rangeLoading ? "opacity-70" : ""} transition-opacity`}
        aria-busy={rangeLoading}
      >
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardHeader className="space-y-1 p-2.5">
            <CardDescription className="text-[11px] leading-none">Games ({rangeKey})</CardDescription>
            <CardTitle className="text-lg font-semibold tabular-nums leading-tight">{totalGames}</CardTitle>
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

      {showCareer ? (
        <Card
          className={`border-border/80 bg-muted/25 ${rangeLoading ? "opacity-70" : ""} transition-opacity`}
        >
          <CardContent className="p-0 px-4 py-3.5 sm:px-5">
            <div className="mb-3 flex items-center gap-3">
              <span
                className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent"
                aria-hidden
              />
              <span className="text-muted-foreground flex shrink-0 flex-col items-center gap-0.5 text-center">
                <span className="text-[10px] font-medium uppercase tracking-[0.18em]">Career</span>
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
                  {props.account.careerKills?.toLocaleString() ?? "—"}
                </p>
                <div className="mt-1.5">
                  <RpDeltaBadge delta={careerDeltas.deltaKills} />
                </div>
              </div>
              <div className="min-w-0 px-4 sm:px-8">
                <p className="text-muted-foreground text-[11px] tracking-wide">Damage</p>
                <p className="mt-0.5 truncate text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">
                  {props.account.careerDamage?.toLocaleString() ?? "—"}
                </p>
                <div className="mt-1.5">
                  <RpDeltaBadge delta={careerDeltas.deltaDamage} />
                </div>
              </div>
              <div className="min-w-0 pl-4 sm:pl-8">
                <p className="text-muted-foreground text-[11px] tracking-wide">Wins</p>
                <p className="mt-0.5 truncate text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">
                  {props.account.careerWins?.toLocaleString() ?? "—"}
                </p>
                <div className="mt-1.5">
                  <RpDeltaBadge delta={careerDeltas.deltaWins} />
                </div>
              </div>
            </div>
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
  const [expandedMap, setExpandedMap] = useState<string | null>(null);

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
        <CardDescription>RP breakdown by ranked map ({rangeKey}). Click a map to see per-legend stats.</CardDescription>
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
                  const isExpanded = expandedMap === row.mapName;
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
                        setExpandedMap((prev) => (prev === row.mapName ? null : row.mapName))
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
