"use client";

import type { TDashboardLiveRecentGameCell } from "@/lib/dashboard-live";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { getLegendIconUrl } from "@/lib/legend-icon-url";
import { cn } from "@/lib/utils";

export const MATCH_GRID_ROWS = 3;
export const MATCH_GRID_COLS = 20;
const DEFAULT_MATCH_GRID_CELLS = MATCH_GRID_ROWS * MATCH_GRID_COLS;

/**
 * Color bin for a cell's background. Opacity-modulated emerald/rose so the
 * grid reads like a GitHub contributions heatmap — brighter = larger |RP|,
 * signed by gain/loss. Tuned to be softer than pure `-500` so long rows of
 * wins/losses don't overwhelm the leaderboard visually.
 */
function rpDeltaColor(rpDelta: number): string {
  if (rpDelta >= 30) return "bg-emerald-500/80";
  if (rpDelta >= 15) return "bg-emerald-500/55";
  if (rpDelta >= 1) return "bg-emerald-500/30";
  if (rpDelta === 0) return "bg-muted/60";
  if (rpDelta <= -30) return "bg-rose-500/80";
  if (rpDelta <= -15) return "bg-rose-500/55";
  return "bg-rose-500/30";
}

function rpDeltaText(rpDelta: number): string {
  if (rpDelta > 0) return `+${rpDelta} RP`;
  if (rpDelta < 0) return `${rpDelta} RP`;
  return "±0 RP";
}

function rpDeltaTextColor(rpDelta: number): string {
  if (rpDelta > 0) return "text-emerald-300";
  if (rpDelta < 0) return "text-rose-300";
  return "text-muted-foreground";
}

export type TMatchGridCellSize = "sm" | "md";

/** Per-cell dimension classes. `sm` matches the leaderboard's compact row
 *  (14px). `md` roughly doubles that for pages with more real estate like the
 *  player profile. Keep gaps scaled proportionally so the overall cadence
 *  reads like a GitHub contributions graph at any size. */
const CELL_SIZE_CLASSES: Record<TMatchGridCellSize, string> = {
  sm: "h-3.5 w-3.5",
  md: "h-6 w-6",
};
const GRID_GAP_CLASSES: Record<TMatchGridCellSize, string> = {
  sm: "gap-1",
  md: "gap-1.5",
};

export type TLeaderboardMatchGridProps = {
  cells: TDashboardLiveRecentGameCell[];
  /** Sibling cells (from party matches) that should be highlighted when their match is hovered. */
  highlightedSegmentIds: ReadonlySet<string>;
  /** Hovered segment id from the shared hover state; receives the primary ring. */
  hoveredSegmentId: string | null;
  onHoverSegment: (segmentId: string | null) => void;
  /**
   * When set, cells whose legend does not match are dimmed. Used by the
   * match summary to "focus" all games played on the top legend without
   * hiding the surrounding context.
   */
  highlightedLegend: string | null;
  /**
   * When set, cells whose map does not match are dimmed. Mirrors
   * `highlightedLegend` so callers can spotlight games played on a given map
   * from adjacent summary UI.
   */
  highlightedMap?: string | null;
  /**
   * Max cell slots to render. Extra cells are truncated; missing cells are
   * padded with placeholders so the grid is always rectangular. Defaults to
   * 60 (3x20) — the leaderboard's compact contribution-graph layout. The
   * player profile uses a larger value and grows it on "Show more".
   */
  maxCells?: number;
  /** Visual density. Defaults to `sm` so the leaderboard stays byte-identical. */
  cellSize?: TMatchGridCellSize;
};

export function LeaderboardMatchGrid(props: TLeaderboardMatchGridProps) {
  const {
    cells,
    highlightedSegmentIds,
    hoveredSegmentId,
    onHoverSegment,
    highlightedLegend,
    highlightedMap,
  } = props;
  const maxCells = props.maxCells ?? DEFAULT_MATCH_GRID_CELLS;
  const cellSize = props.cellSize ?? "sm";
  const cellSizeClass = CELL_SIZE_CLASSES[cellSize];
  const gridGapClass = GRID_GAP_CLASSES[cellSize];
  // Round up to a full row so the grid never renders a ragged bottom edge.
  const totalSlots = Math.max(
    MATCH_GRID_COLS,
    Math.ceil(maxCells / MATCH_GRID_COLS) * MATCH_GRID_COLS,
  );
  const cellsToRender = cells.slice(0, totalSlots);
  const placeholderCount = Math.max(0, totalSlots - cellsToRender.length);

  return (
    <div
      className={cn(
        "grid grid-cols-[repeat(20,minmax(0,auto))]",
        gridGapClass,
        "w-fit shrink-0",
      )}
      role="grid"
      aria-label={`Last ${cellsToRender.length} ranked games, newest first`}
    >
      {cellsToRender.map((cell, index) => {
        const row = Math.floor(index / MATCH_GRID_COLS);
        const col = index % MATCH_GRID_COLS;
        const isHovered = hoveredSegmentId === cell.segmentId;
        const isHighlighted = highlightedSegmentIds.has(cell.segmentId);
        const legendDimmed =
          highlightedLegend !== null &&
          cell.legendAssumed !== highlightedLegend;
        const mapDimmed =
          highlightedMap != null && cell.mapName !== highlightedMap;
        const isDimmed = legendDimmed || mapDimmed;

        return (
          <div key={cell.segmentId} className="relative">
            <button
              type="button"
              onMouseEnter={() => onHoverSegment(cell.segmentId)}
              onMouseLeave={() => onHoverSegment(null)}
              onFocus={() => onHoverSegment(cell.segmentId)}
              onBlur={() => onHoverSegment(null)}
              aria-label={`${rpDeltaText(cell.rpDelta)}${
                cell.legendAssumed ? ` as ${cell.legendAssumed}` : ""
              }${cell.mapName ? ` on ${cell.mapName}` : ""}`}
              className={cn(
                "block rounded-[3px] transition-[opacity,outline,transform]",
                cellSizeClass,
                "focus-visible:outline-none",
                rpDeltaColor(cell.rpDelta),
                (isHovered || isHighlighted) &&
                  "outline outline-2 outline-offset-1 outline-amber-400 relative z-10",
                isDimmed && "opacity-20",
              )}
            />
            {isHovered ? (
              <MatchGridTooltip cell={cell} row={row} column={col} />
            ) : null}
          </div>
        );
      })}
      {Array.from({ length: placeholderCount }).map((_, i) => (
        <div
          key={`placeholder-${i}`}
          className={cn(
            "rounded-[3px] border border-border/30 bg-transparent",
            cellSizeClass,
          )}
          aria-hidden
        />
      ))}
    </div>
  );
}

function MatchGridTooltip(props: {
  cell: TDashboardLiveRecentGameCell;
  row: number;
  column: number;
}) {
  const { cell, row, column } = props;

  /** Anchor horizontally so the tooltip doesn't clip outside the grid on edges. */
  const horizontalAnchor =
    column === 0
      ? "left-0"
      : column === MATCH_GRID_COLS - 1
        ? "right-0"
        : "left-1/2 -translate-x-1/2";

  /**
   * On the top row we render below the cell; otherwise above. Keeps tooltips
   * from being clipped by the card's `overflow-x-auto` (which implicitly clips
   * the Y axis too) at the top of the table.
   */
  const verticalAnchor =
    row === 0
      ? "top-full mt-1 translate-y-1"
      : "bottom-full mb-1 -translate-y-1";

  const legendIcon = getLegendIconUrl(cell.legendAssumed);

  return (
    <div
      role="tooltip"
      className={cn(
        "pointer-events-none absolute z-20 w-max",
        "rounded-md border border-border bg-background/95 px-2 py-1.5 text-xs shadow-lg",
        "backdrop-blur-sm",
        horizontalAnchor,
        verticalAnchor,
      )}
    >
      <div className="flex items-center gap-1.5">
        {legendIcon ? (
          <img
            src={legendIcon}
            alt=""
            className="h-4 w-4 shrink-0 rounded-sm object-cover object-top"
          />
        ) : null}
        <span className="font-medium">{cell.legendAssumed ?? "Unknown"}</span>
        <span className={cn("tabular-nums", rpDeltaTextColor(cell.rpDelta))}>
          {rpDeltaText(cell.rpDelta)}
        </span>
      </div>
      <div className="text-muted-foreground mt-0.5 flex items-center gap-1.5">
        <span>{cell.mapName ?? "—"}</span>
        <span aria-hidden>·</span>
        <span>{formatRelativeTime(cell.endedAt)}</span>
      </div>
    </div>
  );
}
