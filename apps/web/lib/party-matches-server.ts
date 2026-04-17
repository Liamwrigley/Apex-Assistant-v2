import {
  segmentCountsAsInferredRankedGame,
  type TInferredGameSegment,
  type TPartyMatchEdge,
} from "@apex-assistant/db";
import {
  clusterMatchesFromEdges,
  type TPartyMatch,
} from "@/lib/party-matches";

/**
 * Server-only helpers that build match-history data from raw DB rows. Kept
 * separate from `party-matches.ts` because they import the `@apex-assistant/db`
 * runtime (which pulls in `pg`), and `party-matches.ts` is consumed by client
 * components for its types and pure helpers.
 */

/**
 * Wraps each standalone (non-party) segment in a single-player `TPartyMatch`
 * so the match-history UI can render solo games using the same shape as
 * correlated party matches. Skips segments already present in `partyMatches`
 * and filters out short/no-op segments via `segmentCountsAsInferredRankedGame`.
 */
export function buildSoloMatchesFromSegments(
  segments: TInferredGameSegment[],
  partyMatches: TPartyMatch[],
  ignByTrackedAccountId: Map<string, string>,
): TPartyMatch[] {
  const partySegmentIds = new Set<string>();
  for (const m of partyMatches) {
    for (const p of m.players) partySegmentIds.add(p.segmentId);
  }

  const soloMatches: TPartyMatch[] = [];
  for (const seg of segments) {
    if (partySegmentIds.has(seg.id)) continue;
    if (seg.endedAt == null) continue;
    if (!segmentCountsAsInferredRankedGame(seg)) continue;

    const ign = ignByTrackedAccountId.get(seg.trackedAccountId);
    if (!ign) continue;

    const durationSec = Math.max(
      0,
      (seg.endedAt.getTime() - seg.startedAt.getTime()) / 1000,
    );

    soloMatches.push({
      time: seg.startedAt,
      map: seg.rankedMapNameOpen ?? seg.rankedMapNameClose,
      players: [
        {
          ign,
          legend: seg.legendAssumed,
          rpDelta: seg.rpDelta,
          openingRankName: seg.openingRankName,
          openingRankDivision: seg.openingRankDivision,
          openingRankScore: seg.openingRankScore,
          closingRankName: seg.closingRankName,
          closingRankDivision: seg.closingRankDivision,
          closingRankScore: seg.closingRankScore,
          segmentId: seg.id,
          segStart: seg.startedAt,
          segEnd: seg.endedAt,
          duration: durationSec,
        },
      ],
      avgScore: 0,
      edges: [],
    });
  }
  return soloMatches;
}

/**
 * Builds the full match list (party clusters + solo segments) sorted newest
 * first. Intended for the match-history UI where users can toggle between
 * All / Party / Solo views.
 */
export function buildAllMatchesFromEdgesAndSegments(
  edges: TPartyMatchEdge[],
  segments: TInferredGameSegment[],
  ignByTrackedAccountId: Map<string, string>,
): TPartyMatch[] {
  const partyMatches = clusterMatchesFromEdges(edges);
  const soloMatches = buildSoloMatchesFromSegments(
    segments,
    partyMatches,
    ignByTrackedAccountId,
  );
  return [...partyMatches, ...soloMatches].sort(
    (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime(),
  );
}
