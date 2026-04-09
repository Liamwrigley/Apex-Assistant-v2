"use client";

import { RpDeltaBadge } from "@/components/rp-delta-badge";
import { getLegendIconUrl } from "@/lib/legend-icon-url";
import { formatDurationMs } from "@/lib/format-duration";
import { cn } from "@/lib/utils";
import type { TSegmentRow } from "@/components/session-segment-types";
import { ChevronRight } from "lucide-react";

function delta(open: number | null, close: number | null): number | null {
  return open != null && close != null ? close - open : null;
}

export function SessionGamesSummary(props: {
  segments: TSegmentRow[];
  className?: string;
  /** Hint that more detail exists elsewhere (e.g. sidebar). */
  showDetailHint?: boolean;
}) {
  const segs = props.segments;
  return (
    <span
    className={cn(
      "inline-flex items-center gap-1.5 text-xs tabular-nums",
      props.className
    )}
    >
    {segs.length > 0 && 
      <span>
        {segs.length} game{segs.length !== 1 ? "s" : ""}
      </span>
    }
    <span className="text-muted-foreground text-xs">View</span>
        <ChevronRight className="text-muted-foreground size-3.5 shrink-0 opacity-70" aria-hidden />
    </span>
  );
}

export function SessionSegmentsList(props: {
  segments: TSegmentRow[];
  className?: string;
}) {
  const segs = props.segments;
  if (segs.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No estimated games for this session.</p>
    );
  }

  return (
    <ul className={cn("flex flex-col gap-2", props.className)}>
      {segs.map((seg, i) => {
        const iconUrl = seg.legendAssumed ? getLegendIconUrl(seg.legendAssumed) : null;
        const dK = delta(seg.openingCareerKills, seg.closingCareerKills);
        const dD = delta(seg.openingCareerDamage, seg.closingCareerDamage);
        const durationMs =
          seg.endedAt
            ? new Date(seg.endedAt).getTime() - new Date(seg.startedAt).getTime()
            : null;
        const mapName = seg.rankedMapNameOpen ?? seg.rankedMapNameClose;

        return (
          <li
            key={i}
            className="rounded-md border border-border/50 bg-card/60 px-3 py-2.5 text-xs shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                {iconUrl ? (
                  <img src={iconUrl} alt="" className="h-5 w-5 shrink-0 rounded-sm object-cover" />
                ) : null}
                <span className="truncate font-medium">{seg.legendAssumed ?? "?"}</span>
              </div>
              <RpDeltaBadge delta={seg.rpDelta} />
            </div>
            <dl className="text-muted-foreground mt-2 grid grid-cols-2 gap-x-3 gap-y-1 tabular-nums sm:grid-cols-4">
              <div>
                <dt className="text-[10px] uppercase tracking-wide">Kills</dt>
                <dd>{dK != null ? dK : "—"}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide">Dmg</dt>
                <dd>{dD != null ? dD.toLocaleString() : "—"}</dd>
              </div>
              <div className="min-w-0 sm:col-span-1">
                <dt className="text-[10px] uppercase tracking-wide">Map</dt>
                <dd className="truncate">{mapName ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide">Duration</dt>
                <dd>{durationMs != null ? formatDurationMs(durationMs) : "—"}</dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
