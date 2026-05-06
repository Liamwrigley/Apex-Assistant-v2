/**
 * Rank snapshots within [startedAt, endedAt] (caller should pass raw snapshots
 * from the DB, not hourly aggregates), or session open/close RP when we need
 * a line between two points.
 */
export function rankPointsForSessionWindow(
  timeline: Array<{ capturedAt: string; rankScore: number }> | undefined,
  startedAt: string,
  endedAt: string | null,
  openingRankScore: number | null,
  latestRankScore: number | null
): Array<{ capturedAt: string; rankScore: number }> {
  const tStart = new Date(startedAt).getTime();
  const tEnd = endedAt == null ? Date.now() : new Date(endedAt).getTime();
  const endIso = endedAt == null ? new Date(tEnd).toISOString() : endedAt;
  const filtered = (timeline ?? [])
    .filter((p) => {
      const t = new Date(p.capturedAt).getTime();
      return t >= tStart && t <= tEnd;
    })
    .sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());

  if (filtered.length >= 2) {
    return filtered;
  }

  if (
    openingRankScore != null &&
    latestRankScore != null &&
    tEnd > tStart
  ) {
    return [
      { capturedAt: startedAt, rankScore: openingRankScore },
      { capturedAt: endIso, rankScore: latestRankScore },
    ];
  }

  return filtered;
}

export function aggregateRpByLegend(
  games: Array<{ legend: string | null; rpDelta: number | null }>
): { legend: string; totalRp: number }[] {
  const m = new Map<string, number>();
  for (const g of games) {
    if (!g.legend) continue;
    m.set(g.legend, (m.get(g.legend) ?? 0) + (g.rpDelta ?? 0));
  }
  return [...m.entries()]
    .map(([legend, totalRp]) => ({ legend, totalRp }))
    .sort((a, b) => Math.abs(b.totalRp) - Math.abs(a.totalRp));
}

export function uniqueMapsFromGames(
  games: Array<{ rankedMapNameOpen?: string | null; rankedMapNameClose?: string | null }>
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const g of games) {
    const name = g.rankedMapNameClose ?? g.rankedMapNameOpen;
    if (name && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}
