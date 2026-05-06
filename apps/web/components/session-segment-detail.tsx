"use client";

import { useMemo, useState } from "react";
import { RpDeltaBadge } from "@/components/rp-delta-badge";
import { SessionGamesSummary } from "@/components/session-segments-list";
import { getLegendIconUrl } from "@/lib/legend-icon-url";
import { formatDurationMs } from "@/lib/format-duration";
import type { TSegmentRow, TSegmentTrackerDelta } from "@/components/session-segment-types";

export type { TSegmentRow };

/**
 * Build a stable, ordered list of unique tracker columns across all segments
 * so the table header stays consistent even if different segments have
 * different equipped trackers.
 */
function collectTrackerColumns(
  segs: TSegmentRow[]
): Array<{ trackerKey: string; dataIndex: number; displayName: string }> {
  const seen = new Map<string, { trackerKey: string; dataIndex: number; displayName: string }>();
  for (const seg of segs) {
    for (const t of seg.trackerDeltas ?? []) {
      const key = `${t.trackerKey}\0${t.dataIndex}`;
      if (!seen.has(key)) {
        seen.set(key, { trackerKey: t.trackerKey, dataIndex: t.dataIndex, displayName: t.displayName });
      }
    }
  }
  return [...seen.values()].sort((a, b) => a.dataIndex - b.dataIndex);
}

export function SessionSegmentDetail(props: { segments: TSegmentRow[] }) {
  const [open, setOpen] = useState(false);
  const segs = props.segments;
  if (segs.length === 0) return <span className="text-muted-foreground text-xs">—</span>;

  const trackerCols = useMemo(() => collectTrackerColumns(segs), [segs]);
  const hasTrackers = trackerCols.length > 0;

  return (
    <div>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded border border-border/50 bg-muted/30 px-2 py-1 text-xs tabular-nums cursor-pointer hover:bg-muted/60 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-muted-foreground text-[10px]">{open ? "▾" : "▸"}</span>
        <SessionGamesSummary segments={segs} />
      </button>
      {open ? (
        <div className="mt-1.5 overflow-x-auto rounded-md border border-border/50 bg-card">
          <table className="w-full min-w-[480px] text-left text-xs">
            <thead>
              <tr className="text-muted-foreground border-b border-border/40 text-[10px]">
                <th className="px-2.5 py-1.5 font-medium">Legend</th>
                <th className="px-2.5 py-1.5 font-medium text-right">RP</th>
                {hasTrackers
                  ? trackerCols.map((col) => (
                      <th
                        key={`${col.trackerKey}-${col.dataIndex}`}
                        className="px-2.5 py-1.5 font-medium text-right max-w-[7rem] truncate"
                        title={col.displayName}
                      >
                        {col.displayName}
                      </th>
                    ))
                  : null}
                <th className="px-2.5 py-1.5 font-medium">Map</th>
                <th className="px-2.5 py-1.5 font-medium text-right">Duration</th>
              </tr>
            </thead>
            <tbody>
              {segs.map((seg, i) => {
                const iconUrl = seg.legendAssumed ? getLegendIconUrl(seg.legendAssumed) : null;
                const durationMs =
                  seg.endedAt
                    ? new Date(seg.endedAt).getTime() - new Date(seg.startedAt).getTime()
                    : null;
                const mapName = seg.rankedMapNameClose ?? seg.rankedMapNameOpen;

                const deltaMap = new Map<string, TSegmentTrackerDelta>();
                for (const t of seg.trackerDeltas ?? []) {
                  deltaMap.set(`${t.trackerKey}\0${t.dataIndex}`, t);
                }

                return (
                  <tr key={i} className="border-b border-border/30 last:border-0">
                    <td className="px-2.5 py-1.5">
                      <span className="inline-flex items-center gap-1.5">
                        {iconUrl ? (
                          <img src={iconUrl} alt="" className="h-4 w-4 rounded-sm object-cover object-top" />
                        ) : null}
                        <span>{seg.legendAssumed ?? "?"}</span>
                      </span>
                    </td>
                    <td className="px-2.5 py-1.5 text-right">
                      <RpDeltaBadge delta={seg.rpDelta} />
                    </td>
                    {hasTrackers
                      ? trackerCols.map((col) => {
                          const t = deltaMap.get(`${col.trackerKey}\0${col.dataIndex}`);
                          return (
                            <td
                              key={`${col.trackerKey}-${col.dataIndex}`}
                              className="px-2.5 py-1.5 text-right tabular-nums"
                            >
                              {t?.delta != null ? (
                                t.delta.toLocaleString()
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          );
                        })
                      : null}
                    <td className="px-2.5 py-1.5 text-muted-foreground">{mapName ?? "—"}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums text-muted-foreground">
                      {durationMs != null ? formatDurationMs(durationMs) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
