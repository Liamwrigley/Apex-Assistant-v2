import type { TLegendAggregate } from "@apex-assistant/db";

/**
 * Legend name shown for equipped trackers — same priority as `PlayerProfileHeroImage`:
 * online with a realtime legend icon → realtime selected legend;
 * else most-played in the current range (aggregates[0]);
 * else last-seen realtime legend if we have an icon;
 * else null (hero shows rank icon / no legend).
 */
export function resolveProfileDisplayLegendName(input: {
  isOnline: boolean;
  lastSeenLegendIconUrl: string | null;
  realtimeSelectedLegend: string | null | undefined;
  legendAggregates: TLegendAggregate[];
}): string | null {
  const sel = input.realtimeSelectedLegend?.trim() || null;
  const most = input.legendAggregates[0]?.legend?.trim() || null;

  if (input.isOnline && input.lastSeenLegendIconUrl) {
    return sel;
  }
  if (most) {
    return most;
  }
  if (input.lastSeenLegendIconUrl) {
    return sel;
  }
  return null;
}
