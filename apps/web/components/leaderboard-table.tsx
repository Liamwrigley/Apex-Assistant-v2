"use client";

import { useMemo, useState } from "react";
import { PendingLink } from "@/components/pending-link";
import {
  LeaderboardMatchGrid,
} from "@/components/leaderboard-match-grid";
import {
  AvgCellContent,
  RecordCellContent,
  TopLegendCellContent,
  computeMatchSummary,
  type TMatchSummary,
} from "@/components/leaderboard-match-summary";
import { PlayerTimelineSparkline } from "@/components/player-timeline-sparkline";
import { getRankIconUrl } from "@/lib/rank-icon-url";
import { RpDeltaBadge } from "@/components/rp-delta-badge";
import type { TDashboardLiveRecentGameCell } from "@/lib/dashboard-live";
import {
  buildSegmentPartyIndex,
  type TPartyMatchSerialized,
} from "@/lib/party-matches";

type TLeaderboardRow = {
  trackedAccountId: string;
  ign: string;
  platform: string;
  rankScore: number;
  rankName: string;
  rankDivision: string | null;
  deltaRp24h: number | null;
  deltaRp7d: number | null;
  deltaRp30d: number | null;
  ownerDisplayName: string | null;
};
type TTimelinePoint = { capturedAt: string; rankScore: number };

export type TLeaderboardViewMode = "sparkline" | "matches";
export type TRpDeltaWindow = "24h" | "7d" | "30d";

const RP_DELTA_WINDOW_LABEL: Record<TRpDeltaWindow, string> = {
  "24h": "24h",
  "7d": "7d",
  "30d": "30d",
};

function pickRpDelta(
  row: {
    deltaRp24h: number | null;
    deltaRp7d: number | null;
    deltaRp30d: number | null;
  },
  window: TRpDeltaWindow,
): number | null {
  if (window === "24h") return row.deltaRp24h;
  if (window === "7d") return row.deltaRp7d;
  return row.deltaRp30d;
}

const EMPTY_HIGHLIGHTS: ReadonlySet<string> = new Set();

export function LeaderboardTable(props: {
  rows: TLeaderboardRow[];
  timelines: Record<string, TTimelinePoint[]>;
  viewMode: TLeaderboardViewMode;
  rpDeltaWindow: TRpDeltaWindow;
  recentGamesByTrackedAccountId: Record<string, TDashboardLiveRecentGameCell[]>;
  partyMatches: TPartyMatchSerialized[];
}) {
  const [hoveredSegmentId, setHoveredSegmentId] = useState<string | null>(null);

  /** Fixed descending by rank score — the only ordering that makes sense for a leaderboard. */
  const sortedRows = useMemo(() => {
    return [...props.rows].sort((a, b) => b.rankScore - a.rankScore);
  }, [props.rows]);

  /** One shared x-axis for all visible sparklines so the same wall time lines up row-to-row. */
  const timelineXDomain = useMemo(() => {
    if (props.viewMode !== "sparkline") return null;
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
  }, [props.timelines, props.viewMode, sortedRows]);

  const partyIndex = useMemo(
    () =>
      props.viewMode === "matches"
        ? buildSegmentPartyIndex(props.partyMatches)
        : null,
    [props.partyMatches, props.viewMode],
  );

  const highlightedSegmentIds = useMemo<ReadonlySet<string>>(() => {
    if (!hoveredSegmentId || !partyIndex) return EMPTY_HIGHLIGHTS;
    const entry = partyIndex.get(hoveredSegmentId);
    if (!entry) return EMPTY_HIGHLIGHTS;
    return new Set(entry.partnerSegmentIds);
  }, [hoveredSegmentId, partyIndex]);

  const isMatches = props.viewMode === "matches";

  return (
    <table className="w-full min-w-[760px] text-left text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-xs">
            <th className="whitespace-nowrap px-2 py-2 font-medium" title="Tracked player IGN">
              Player
            </th>
            <th className="whitespace-nowrap px-2 py-2 font-medium" title="Latest rank tier and current RP">
              Rank
            </th>
            <th
              className="w-[110px] min-w-[110px] whitespace-nowrap px-2 py-2 text-right font-medium"
              title={`Rolling RP change over the last ${RP_DELTA_WINDOW_LABEL[props.rpDeltaWindow]}`}
            >
              {RP_DELTA_WINDOW_LABEL[props.rpDeltaWindow]} Delta
            </th>
            <th
              className="w-full px-2 py-2 text-center font-medium"
              colSpan={isMatches ? 4 : 1}
              title={
                isMatches
                  ? "Last 60 ranked games, newest top-left. Hover to see legend, RP, and map."
                  : "7-day RP sparkline. Hover to scrub point values."
              }
            >
              {isMatches ? "Last 60 games" : "7d Trend"}
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => {
            const cells =
              props.recentGamesByTrackedAccountId[row.trackedAccountId] ?? [];
            return (
              <tr key={row.trackedAccountId} className="border-border/60 border-b last:border-0">
                <td className="px-2 py-2 align-middle">
                  <div className="flex min-w-0 flex-col leading-tight">
                    <PendingLink
                      href={`/player/${row.trackedAccountId}`}
                      className="truncate text-sm font-medium hover:underline"
                      title={row.ign}
                    >
                      {row.ign}
                    </PendingLink>
                    {row.ownerDisplayName ? (
                      <span
                        className="text-muted-foreground truncate text-[11px]"
                        title={row.ownerDisplayName}
                      >
                        {row.ownerDisplayName}
                      </span>
                    ) : null}
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
                {/* Width is reserved for the widest badge ("+99,999" ≈ 86px incl. icon + padding)
                    so switching between 24h / 7d / 30d never shifts adjacent columns. */}
                <td className="w-[110px] min-w-[110px] whitespace-nowrap px-2 py-2 text-right align-middle">
                  <RpDeltaBadge delta={pickRpDelta(row, props.rpDeltaWindow)} />
                </td>
                {isMatches ? (
                  <LeaderboardMatchesCells
                    cells={cells}
                    hoveredSegmentId={hoveredSegmentId}
                    highlightedSegmentIds={highlightedSegmentIds}
                    onHoverSegment={setHoveredSegmentId}
                  />
                ) : (
                  <td className="w-full overflow-visible px-2 py-2 align-middle">
                    {/* Fixed min-height so toggling between sparkline and grid does not
                        resize the row. 74px matches the sparkline's chart + day-tick strip. */}
                    <div className="flex min-h-[74px] items-center justify-start overflow-visible">
                      <PlayerTimelineSparkline
                        trackedAccountId={row.trackedAccountId}
                        hours={168}
                        points={props.timelines[row.trackedAccountId] ?? []}
                        xDomain={timelineXDomain}
                      />
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
    </table>
  );
}

/**
 * Renders the 4 matches-mode cells (grid, top legend, record, avg). Each row
 * owns its own `hoveredLegend` state so the legend highlight only affects its
 * own grid. Using real `<td>` elements means the browser auto-aligns column
 * widths across every player row.
 */
function LeaderboardMatchesCells(props: {
  cells: TDashboardLiveRecentGameCell[];
  hoveredSegmentId: string | null;
  highlightedSegmentIds: ReadonlySet<string>;
  onHoverSegment: (segmentId: string | null) => void;
}) {
  const [hoveredLegend, setHoveredLegend] = useState<string | null>(null);
  const summary: TMatchSummary = useMemo(
    () => computeMatchSummary(props.cells),
    [props.cells],
  );
  const hasCells = props.cells.length > 0;

  return (
    <>
      {/* The grid is w-fit; whitespace-nowrap + explicit min-w keep the table auto-layout
          algorithm from compressing the 60-cell grid into a smaller column. */}
      <td className="w-[380px] min-w-[380px] whitespace-nowrap overflow-visible px-2 py-2 align-middle">
        {/* 74px matches the sparkline's chart + day-tick strip height so the
            row height is identical between matches and sparkline modes. */}
        <div className="flex min-h-[74px] items-center">
          <LeaderboardMatchGrid
            cells={props.cells}
            hoveredSegmentId={props.hoveredSegmentId}
            highlightedSegmentIds={props.highlightedSegmentIds}
            onHoverSegment={props.onHoverSegment}
            highlightedLegend={hoveredLegend}
          />
        </div>
      </td>
      <td className="whitespace-nowrap px-2 py-2 align-middle">
        {hasCells ? (
          <TopLegendCellContent
            summary={summary}
            onLegendHover={setHoveredLegend}
          />
        ) : null}
      </td>
      <td className="whitespace-nowrap px-2 py-2 align-middle">
        {hasCells ? <RecordCellContent summary={summary} /> : null}
      </td>
      <td className="w-full whitespace-nowrap px-2 py-2 align-middle">
        {hasCells ? <AvgCellContent summary={summary} /> : null}
      </td>
    </>
  );
}
