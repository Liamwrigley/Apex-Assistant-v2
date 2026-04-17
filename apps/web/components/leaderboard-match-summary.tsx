"use client";

import type { TDashboardLiveRecentGameCell } from "@/lib/dashboard-live";
import { getLegendIconUrl } from "@/lib/legend-icon-url";
import { cn } from "@/lib/utils";

export type TMatchSummary = {
  wins: number;
  losses: number;
  /** Mean RP delta across every game in the window. Sign = net direction. */
  avgRp: number;
  gamesCounted: number;
  topLegend: { name: string; count: number } | null;
};

/** Stats derived from the same cells that power the match grid. */
export function computeMatchSummary(
  cells: TDashboardLiveRecentGameCell[],
): TMatchSummary {
  let wins = 0;
  let losses = 0;
  let totalRp = 0;
  const legendCounts = new Map<string, number>();

  for (const cell of cells) {
    totalRp += cell.rpDelta;
    if (cell.rpDelta > 0) wins++;
    else if (cell.rpDelta < 0) losses++;
    if (cell.legendAssumed) {
      legendCounts.set(
        cell.legendAssumed,
        (legendCounts.get(cell.legendAssumed) ?? 0) + 1,
      );
    }
  }

  let topLegend: { name: string; count: number } | null = null;
  for (const [name, count] of legendCounts) {
    if (!topLegend || count > topLegend.count) {
      topLegend = { name, count };
    }
  }

  return {
    wins,
    losses,
    avgRp: cells.length > 0 ? totalRp / cells.length : 0,
    gamesCounted: cells.length,
    topLegend,
  };
}

function signedAvg(value: number): string {
  if (value > 0) return `+${value.toFixed(1)}`;
  return value.toFixed(1);
}

function CellLabel(props: { children: React.ReactNode }) {
  return (
    <span className="text-muted-foreground block text-[10px] uppercase tracking-wide leading-tight">
      {props.children}
    </span>
  );
}

export function TopLegendCellContent(props: {
  summary: TMatchSummary;
  onLegendHover?: (legendName: string | null) => void;
}) {
  const { summary, onLegendHover } = props;
  const { topLegend } = summary;
  if (!topLegend) return null;
  const legendIcon = getLegendIconUrl(topLegend.name);
  return (
    <button
      type="button"
      onMouseEnter={() => onLegendHover?.(topLegend.name)}
      onMouseLeave={() => onLegendHover?.(null)}
      onFocus={() => onLegendHover?.(topLegend.name)}
      onBlur={() => onLegendHover?.(null)}
      className={cn(
        "-mx-1 flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-left",
        "transition-colors hover:bg-muted/50",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400",
      )}
      aria-label={`Highlight ${topLegend.name} games`}
    >
      {legendIcon ? (
        <img
          src={legendIcon}
          alt=""
          className="h-7 w-7 shrink-0 rounded-sm border border-border/50 object-cover object-top"
        />
      ) : null}
      <div className="flex min-w-0 flex-col leading-tight">
        <CellLabel>Top Legend</CellLabel>
        <span className="truncate text-xs font-medium" title={topLegend.name}>
          {topLegend.name}
          <span className="text-muted-foreground ml-1 tabular-nums">
            ×{topLegend.count}
          </span>
        </span>
      </div>
    </button>
  );
}

export function RecordCellContent(props: { summary: TMatchSummary }) {
  const { wins, losses } = props.summary;
  return (
    <div className="flex flex-col leading-tight">
      <CellLabel>Record</CellLabel>
      <span className="tabular-nums text-xs">
        <span className="text-emerald-300">{wins}W</span>
        <span className="text-muted-foreground mx-1">·</span>
        <span className="text-rose-300">{losses}L</span>
      </span>
    </div>
  );
}

export function AvgCellContent(props: { summary: TMatchSummary }) {
  const { avgRp, gamesCounted } = props.summary;
  return (
    <div className="flex flex-col leading-tight">
      <CellLabel>Avg</CellLabel>
      <span className="tabular-nums text-xs">
        {gamesCounted > 0 ? (
          <span
            className={cn(
              avgRp > 0 && "text-emerald-300",
              avgRp < 0 && "text-rose-300",
              avgRp === 0 && "text-muted-foreground",
            )}
          >
            {signedAvg(avgRp)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </span>
    </div>
  );
}
