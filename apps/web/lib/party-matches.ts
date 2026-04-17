import type { TPartyMatchEdge } from "@apex-assistant/db";

export type TMatchPlayer = {
  ign: string;
  legend: string | null;
  rpDelta: number | null;
  openingRankName: string | null;
  openingRankDivision: string | null;
  openingRankScore: number | null;
  closingRankName: string | null;
  closingRankDivision: string | null;
  closingRankScore: number | null;
  segmentId: string;
  segStart: Date;
  segEnd: Date;
  duration: number;
};

export type TPartyMatch = {
  time: Date;
  map: string | null;
  players: TMatchPlayer[];
  avgScore: number;
  edges: Array<{
    ignA: string;
    ignB: string;
    score: number;
    evidence: Record<string, unknown>;
  }>;
};

export function clusterMatchesFromEdges(edges: TPartyMatchEdge[]): TPartyMatch[] {
  const parent = new Map<string, string>();
  function find(x: string): string {
    if (!parent.has(x)) parent.set(x, x);
    let root = parent.get(x)!;
    while (root !== parent.get(root)!) root = parent.get(root)!;
    let cur = x;
    while (cur !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  function union(a: string, b: string) {
    const ra = find(a),
      rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  for (const edge of edges) {
    union(edge.segmentIdA, edge.segmentIdB);
  }

  const clusterEdges = new Map<string, TPartyMatchEdge[]>();
  for (const edge of edges) {
    const root = find(edge.segmentIdA);
    const group = clusterEdges.get(root) ?? [];
    group.push(edge);
    clusterEdges.set(root, group);
  }

  const matches: TPartyMatch[] = [];
  for (const group of clusterEdges.values()) {
    const playerMap = new Map<string, TMatchPlayer>();
    let mapName: string | null = null;

    for (const edge of group) {
      if (!playerMap.has(edge.segmentIdA)) {
        playerMap.set(edge.segmentIdA, {
          ign: edge.ignA,
          legend: edge.legendA,
          rpDelta: edge.rpDeltaA,
          openingRankName: edge.openingRankNameA,
          openingRankDivision: edge.openingRankDivisionA,
          openingRankScore: edge.openingRankScoreA,
          closingRankName: edge.closingRankNameA,
          closingRankDivision: edge.closingRankDivisionA,
          closingRankScore: edge.closingRankScoreA,
          segmentId: edge.segmentIdA,
          segStart: edge.segStartA,
          segEnd: edge.segEndA,
          duration: edge.durationA,
        });
      }
      if (!playerMap.has(edge.segmentIdB)) {
        playerMap.set(edge.segmentIdB, {
          ign: edge.ignB,
          legend: edge.legendB,
          rpDelta: edge.rpDeltaB,
          openingRankName: edge.openingRankNameB,
          openingRankDivision: edge.openingRankDivisionB,
          openingRankScore: edge.openingRankScoreB,
          closingRankName: edge.closingRankNameB,
          closingRankDivision: edge.closingRankDivisionB,
          closingRankScore: edge.closingRankScoreB,
          segmentId: edge.segmentIdB,
          segStart: edge.segStartB,
          segEnd: edge.segEndB,
          duration: edge.durationB,
        });
      }
      if (!mapName) mapName = edge.mapA ?? edge.mapB;
    }

    const players = [...playerMap.values()].sort((a, b) =>
      a.ign.localeCompare(b.ign)
    );
    const totalScore = group.reduce((sum, e) => sum + e.score, 0);
    const avgScore = group.length > 0 ? totalScore / group.length : 0;
    const earliest = players.reduce(
      (min, p) =>
        new Date(p.segStart).getTime() < new Date(min).getTime()
          ? p.segStart
          : min,
      players[0].segStart
    );

    matches.push({
      time: earliest,
      map: mapName,
      players,
      avgScore,
      edges: group.map((e) => ({
        ignA: e.ignA,
        ignB: e.ignB,
        score: e.score,
        evidence: e.evidence as Record<string, unknown>,
      })),
    });
  }

  return matches.sort(
    (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
  );
}

/** Serialize dates for client props. */
export type TPartyMatchSerialized = Omit<TPartyMatch, "time" | "players"> & {
  time: string;
  players: Array<Omit<TMatchPlayer, "segStart" | "segEnd"> & { segStart: string; segEnd: string }>;
};

export function serializePartyMatches(
  matches: TPartyMatch[]
): TPartyMatchSerialized[] {
  return matches.map((m) => ({
    ...m,
    time: m.time instanceof Date ? m.time.toISOString() : String(m.time),
    players: m.players.map((p) => ({
      ...p,
      segStart: p.segStart instanceof Date ? p.segStart.toISOString() : String(p.segStart),
      segEnd: p.segEnd instanceof Date ? p.segEnd.toISOString() : String(p.segEnd),
    })),
  }));
}

export type TSegmentPartyIndexEntry = {
  matchIndex: number;
  partnerSegmentIds: string[];
};

/**
 * Given the serialized party matches shipped to the client, builds a
 * `segmentId -> { matchIndex, partnerSegmentIds }` lookup so any match cell on
 * the leaderboard can find its teammates' cells in O(1). `partnerSegmentIds`
 * excludes the key's own segment, so it's directly usable as the highlight set
 * for sibling cells (the hovered cell itself is handled separately in the UI).
 */
export function buildSegmentPartyIndex(
  matches: TPartyMatchSerialized[],
): Map<string, TSegmentPartyIndexEntry> {
  const index = new Map<string, TSegmentPartyIndexEntry>();
  for (let matchIndex = 0; matchIndex < matches.length; matchIndex++) {
    const match = matches[matchIndex];
    const allIds = match.players.map((p) => p.segmentId);
    for (const player of match.players) {
      index.set(player.segmentId, {
        matchIndex,
        partnerSegmentIds: allIds.filter((id) => id !== player.segmentId),
      });
    }
  }
  return index;
}
