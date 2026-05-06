"use client";

import { useMemo, useState } from "react";
import { LeaderboardMatchGrid } from "@/components/leaderboard-match-grid";
import { PlayerTimelineSparkline } from "@/components/player-timeline-sparkline";
import { RpDeltaBadge } from "@/components/rp-delta-badge";
import { SessionSegmentsList } from "@/components/session-segments-list";
import type { TSegmentRow } from "@/components/session-segment-types";
import { ToggleGroup } from "@/components/ui/toggle-group";
import type { TDashboardLiveRecentGameCell } from "@/lib/dashboard-live";
import { aggregateRpByLegend, uniqueMapsFromGames } from "@/lib/session-rank-sparkline";
import { getLegendIconUrl } from "@/lib/legend-icon-url";
import type { TEstimatedGame, TRecentSessionRow } from "@/components/recent-sessions-types";

function estimatedToSegments(games: TEstimatedGame[] | undefined): TSegmentRow[] {
  return (games ?? []).map((g) => ({
    legendAssumed: g.legend,
    rpDelta: g.rpDelta,
    confidence: g.confidence,
    mergeRisk: g.mergeRisk,
    startedAt: g.startedAt ?? "",
    endedAt: g.endedAt ?? null,
    rankedMapNameOpen: g.rankedMapNameOpen ?? null,
    rankedMapNameClose: g.rankedMapNameClose ?? null,
    openingCareerKills: g.openingCareerKills ?? null,
    closingCareerKills: g.closingCareerKills ?? null,
    openingCareerDamage: g.openingCareerDamage ?? null,
    closingCareerDamage: g.closingCareerDamage ?? null,
    trackerDeltas: g.trackerDeltas,
  }));
}

/**
 * Maps session-scoped `TEstimatedGame`s onto the same cell shape the match
 * grid uses on the leaderboard and profile pages, so a single grid component
 * powers every surface. Games without a `startedAt` are filtered out since
 * the grid keys off newest-first ordering and we'd have no reliable way to
 * slot them in. `segmentId` is synthesized from the tracked account + start
 * time — unique enough within a session for React keys and hover state.
 */
function estimatedToMatchCells(
  games: TEstimatedGame[] | undefined,
  trackedAccountId: string,
): TDashboardLiveRecentGameCell[] {
  const withStart = (games ?? []).filter(
    (g): g is TEstimatedGame & { startedAt: string } => Boolean(g.startedAt),
  );
  const sorted = [...withStart].sort(
    (a, b) =>
      new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
  return sorted.map((g) => ({
    segmentId: `${trackedAccountId}:${g.startedAt}`,
    trackedAccountId,
    startedAt: g.startedAt,
    endedAt: g.endedAt ?? g.startedAt,
    legendAssumed: g.legend,
    rpDelta: g.rpDelta ?? 0,
    mapName: g.rankedMapNameClose ?? g.rankedMapNameOpen ?? null,
  }));
}

const EMPTY_HIGHLIGHTS: ReadonlySet<string> = new Set();

type TSessionRpViewMode = "line" | "grid";

export function RecentSessionDetailModalBody(props: { row: TRecentSessionRow }) {
  const { row } = props;
  const segments = estimatedToSegments(row.estimatedGames);
  const legendRp = aggregateRpByLegend(row.estimatedGames ?? []);
  const maps = uniqueMapsFromGames(row.estimatedGames ?? []);
  const startMs = new Date(row.startedAt).getTime();
  const endMs = row.endedAt ? new Date(row.endedAt).getTime() : Date.now();
  const trackedAccountId = row.trackedAccountId ?? "unknown";

  const matchCells = useMemo(
    () => estimatedToMatchCells(row.estimatedGames, trackedAccountId),
    [row.estimatedGames, trackedAccountId],
  );
  const canShowLine = row.rankSparklinePoints.length >= 2;
  const canShowGrid = matchCells.length > 0;
  /** Default to whichever view has data. Line is the historical default —
   *  stay on it whenever it's available so returning users see the same view. */
  const [viewMode, setViewMode] = useState<TSessionRpViewMode>(() =>
    canShowLine ? "line" : canShowGrid ? "grid" : "line",
  );
  const [hoveredSegmentId, setHoveredSegmentId] = useState<string | null>(null);

  return (
    <div className="flex max-h-[min(75vh,720px)] flex-col">
      <div className="scrollbar-app min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <section className="mb-6">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              RP during session
            </h3>
            {canShowLine && canShowGrid ? (
              <ToggleGroup
                value={viewMode}
                onChange={setViewMode}
                options={[
                  { value: "line", label: "Line" },
                  { value: "grid", label: "Grid" },
                ]}
                ariaLabel="RP during session view mode"
              />
            ) : null}
          </div>
          <div className="bg-muted/20 rounded-lg border border-border/50 p-3">
            {viewMode === "line" ? (
              canShowLine ? (
                <PlayerTimelineSparkline
                  trackedAccountId={trackedAccountId}
                  points={row.rankSparklinePoints}
                  variant="profile"
                  xDomain={
                    endMs > startMs ? { minMs: startMs, maxMs: endMs } : null
                  }
                />
              ) : (
                <p className="text-muted-foreground py-6 text-center text-sm">
                  Not enough rank snapshots in this window to draw a line. RP still reflects session
                  start vs end in the table.
                </p>
              )
            ) : canShowGrid ? (
              <div className="flex justify-center py-2">
                <LeaderboardMatchGrid
                  cells={matchCells}
                  highlightedSegmentIds={EMPTY_HIGHLIGHTS}
                  hoveredSegmentId={hoveredSegmentId}
                  onHoverSegment={setHoveredSegmentId}
                  highlightedLegend={null}
                  maxCells={matchCells.length}
                  cellSize="md"
                />
              </div>
            ) : (
              <p className="text-muted-foreground py-6 text-center text-sm">
                No estimated games available for a grid view.
              </p>
            )}
          </div>
        </section>

        {legendRp.length > 0 ? (
          <section className="mb-6">
            <h3 className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
              RP by legend
            </h3>
            <ul className="flex flex-col gap-2">
              {legendRp.map((entry) => {
                const iconUrl = getLegendIconUrl(entry.legend);
                return (
                  <li
                    key={entry.legend}
                    className="bg-card/60 flex items-center justify-between gap-3 rounded-md border border-border/40 px-3 py-2 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {iconUrl ? (
                        <img src={iconUrl} alt="" className="h-6 w-6 shrink-0 rounded-sm object-cover object-top" />
                      ) : null}
                      <span className="truncate font-medium">{entry.legend}</span>
                    </span>
                    <RpDeltaBadge delta={entry.totalRp} />
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {maps.length > 0 ? (
          <section className="mb-6">
            <h3 className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
              Maps (from segment open snapshots)
            </h3>
            <ul className="text-muted-foreground flex flex-wrap gap-2 text-sm">
              {maps.map((name) => (
                <li
                  key={name}
                  className="bg-muted/40 rounded-md border border-border/30 px-2.5 py-1"
                >
                  {name}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <h3 className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
            Estimated games
          </h3>
          <SessionSegmentsList segments={segments} />
        </section>
      </div>
    </div>
  );
}
