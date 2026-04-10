import type { TTrackerObservationRow, TTrackerStatDelta } from "@apex-assistant/db";
import { normalizeLegendName } from "@apex-assistant/core";

export type TTrackerRowUi = {
  legendName: string;
  trackerKey: string;
  displayName: string;
  value: number;
  dataIndex: number;
  source: "selected" | "all";
  delta: number | null;
};

/** Merge latest snapshot rows with range deltas for the selected legend. */
export function buildTrackerRowsForProfile(
  snapshot: TTrackerObservationRow[],
  deltas: TTrackerStatDelta[],
  selectedLegend: string | null
): TTrackerRowUi[] {
  if (!selectedLegend?.trim()) {
    return [];
  }
  const norm = normalizeLegendName(selectedLegend);
  const deltaMap = new Map<string, number | null>();
  for (const d of deltas) {
    if (normalizeLegendName(d.legendName) !== norm) continue;
    deltaMap.set(`${d.trackerKey}\0${d.dataIndex}`, d.delta);
  }
  return snapshot.map((r) => ({
    legendName: r.legendName,
    trackerKey: r.trackerKey,
    displayName: r.displayName,
    value: r.value,
    dataIndex: r.dataIndex,
    source: r.source,
    delta: deltaMap.get(`${r.trackerKey}\0${r.dataIndex}`) ?? null,
  }));
}
