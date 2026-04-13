"use client";

import { PlayerTimelineSparkline } from "@/components/player-timeline-sparkline";
import { RpDeltaBadge } from "@/components/rp-delta-badge";
import { SessionSegmentsList } from "@/components/session-segments-list";
import type { TSegmentRow } from "@/components/session-segment-types";
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

export function RecentSessionDetailModalBody(props: { row: TRecentSessionRow }) {
  const { row } = props;
  const segments = estimatedToSegments(row.estimatedGames);
  const legendRp = aggregateRpByLegend(row.estimatedGames ?? []);
  const maps = uniqueMapsFromGames(row.estimatedGames ?? []);
  const startMs = new Date(row.startedAt).getTime();
  const endMs = row.endedAt ? new Date(row.endedAt).getTime() : Date.now();

  return (
    <div className="flex max-h-[min(75vh,720px)] flex-col">
      <div className="scrollbar-app min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <section className="mb-6">
          <h3 className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
            RP during session
          </h3>
          <div className="bg-muted/20 rounded-lg border border-border/50 p-3">
            {row.rankSparklinePoints.length >= 2 ? (
              <PlayerTimelineSparkline
                trackedAccountId={row.trackedAccountId ?? "unknown"}
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
                        <img src={iconUrl} alt="" className="h-6 w-6 shrink-0 rounded-sm object-cover" />
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
