"use client";

import { RpDeltaBadge } from "@/components/rp-delta-badge";
import { getLegendIconUrl } from "@/lib/legend-icon-url";
import { formatDurationMs } from "@/lib/format-duration";
import { cn } from "@/lib/utils";
import type { TSegmentRow } from "@/components/session-segment-types";
import { ChevronRight } from "lucide-react";

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
        const trackers = seg.trackerDeltas ?? [];
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
              {trackers.length > 0 ? (
                trackers.map((t) => (
                  <div key={`${t.trackerKey}-${t.dataIndex}`}>
                    <dt className="text-[10px] uppercase tracking-wide truncate" title={t.displayName}>
                      {t.displayName}
                    </dt>
                    <dd>{t.delta != null ? t.delta.toLocaleString() : "—"}</dd>
                  </div>
                ))
              ) : (
                <div className="col-span-2 sm:col-span-2">
                  <dt className="text-[10px] uppercase tracking-wide">Trackers</dt>
                  <dd className="text-muted-foreground">No tracker data</dd>
                </div>
              )}
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
