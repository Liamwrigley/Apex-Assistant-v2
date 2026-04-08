"use client";

import { useState } from "react";
import { RpDeltaBadge } from "@/components/rp-delta-badge";
import { getLegendIconUrl } from "@/lib/legend-icon-url";
import { formatDurationMs } from "@/lib/format-duration";

export type TSegmentRow = {
  legendAssumed: string | null;
  rpDelta: number | null;
  confidence: string;
  mergeRisk: boolean;
  startedAt: string;
  endedAt: string | null;
  rankedMapNameOpen: string | null;
  rankedMapNameClose: string | null;
  openingCareerKills: number | null;
  closingCareerKills: number | null;
  openingCareerDamage: number | null;
  closingCareerDamage: number | null;
};

function delta(open: number | null, close: number | null): number | null {
  return open != null && close != null ? close - open : null;
}

export function SessionSegmentDetail(props: { segments: TSegmentRow[] }) {
  const [open, setOpen] = useState(false);
  const segs = props.segments;
  if (segs.length === 0) return <span className="text-muted-foreground text-xs">—</span>;

  const totalRp = segs.reduce((s, g) => s + (g.rpDelta ?? 0), 0);

  return (
    <div>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded border border-border/50 bg-muted/30 px-2 py-1 text-xs tabular-nums cursor-pointer hover:bg-muted/60 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-muted-foreground text-[10px]">{open ? "▾" : "▸"}</span>
        <span>{segs.length} game{segs.length !== 1 ? "s" : ""}</span>
        <RpDeltaBadge delta={totalRp} />
      </button>
      {open ? (
        <div className="mt-1.5 overflow-x-auto rounded-md border border-border/50 bg-card">
          <table className="w-full min-w-[480px] text-left text-xs">
            <thead>
              <tr className="text-muted-foreground border-b border-border/40 text-[10px]">
                <th className="px-2.5 py-1.5 font-medium">Legend</th>
                <th className="px-2.5 py-1.5 font-medium text-right">RP</th>
                <th className="px-2.5 py-1.5 font-medium text-right">Kills</th>
                <th className="px-2.5 py-1.5 font-medium text-right">Dmg</th>
                <th className="px-2.5 py-1.5 font-medium">Map</th>
                <th className="px-2.5 py-1.5 font-medium text-right">Duration</th>
              </tr>
            </thead>
            <tbody>
              {segs.map((seg, i) => {
                const iconUrl = seg.legendAssumed ? getLegendIconUrl(seg.legendAssumed) : null;
                const dK = delta(seg.openingCareerKills, seg.closingCareerKills);
                const dD = delta(seg.openingCareerDamage, seg.closingCareerDamage);
                const durationMs =
                  seg.endedAt
                    ? new Date(seg.endedAt).getTime() - new Date(seg.startedAt).getTime()
                    : null;
                const mapName = seg.rankedMapNameClose ?? seg.rankedMapNameOpen;
                return (
                  <tr key={i} className="border-b border-border/30 last:border-0">
                    <td className="px-2.5 py-1.5">
                      <span className="inline-flex items-center gap-1.5">
                        {iconUrl ? (
                          <img src={iconUrl} alt="" className="h-4 w-4 rounded-sm object-cover" />
                        ) : null}
                        <span>{seg.legendAssumed ?? "?"}</span>
                      </span>
                    </td>
                    <td className="px-2.5 py-1.5 text-right">
                      <RpDeltaBadge delta={seg.rpDelta} />
                    </td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">
                      {dK != null ? dK : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">
                      {dD != null ? dD.toLocaleString() : <span className="text-muted-foreground">—</span>}
                    </td>
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
