import { pool } from "../client.js";

export type TInferredGameSegment = {
  id: string;
  playSessionId: string;
  trackedAccountId: string;
  startedAt: Date;
  endedAt: Date | null;
  legendAssumed: string | null;
  openingRankScore: number | null;
  closingRankScore: number | null;
  rpDelta: number | null;
  confidence: string;
  mergeRisk: boolean;
  triggerSignals: Record<string, unknown>;
  openingRankName: string | null;
  openingRankDivision: string | null;
  closingRankName: string | null;
  closingRankDivision: string | null;
  rankedMapCodeOpen: string | null;
  rankedMapNameOpen: string | null;
  rankedMapCodeClose: string | null;
  rankedMapNameClose: string | null;
};

const SEGMENT_FIELDS = `
  id,
  play_session_id as "playSessionId",
  tracked_account_id as "trackedAccountId",
  started_at as "startedAt",
  ended_at as "endedAt",
  legend_assumed as "legendAssumed",
  opening_rank_score as "openingRankScore",
  closing_rank_score as "closingRankScore",
  rp_delta as "rpDelta",
  confidence,
  merge_risk as "mergeRisk",
  trigger_signals as "triggerSignals",
  opening_rank_name as "openingRankName",
  opening_rank_division as "openingRankDivision",
  closing_rank_name as "closingRankName",
  closing_rank_division as "closingRankDivision",
  ranked_map_code_open as "rankedMapCodeOpen",
  ranked_map_name_open as "rankedMapNameOpen",
  ranked_map_code_close as "rankedMapCodeClose",
  ranked_map_name_close as "rankedMapNameClose"
`;

export async function getOpenSegment(
  trackedAccountId: string
): Promise<TInferredGameSegment | null> {
  const result = await pool.query<TInferredGameSegment>(
    `select ${SEGMENT_FIELDS}
     from inferred_game_segments
     where tracked_account_id = $1 and ended_at is null
     for update`,
    [trackedAccountId]
  );
  return result.rows[0] ?? null;
}

export async function openSegment(input: {
  playSessionId: string;
  trackedAccountId: string;
  legendAssumed: string | null;
  openingRankScore: number | null;
  openingRankName: string | null;
  openingRankDivision: string | null;
  rankedMapCode: string | null;
  rankedMapName: string | null;
}): Promise<TInferredGameSegment> {
  const result = await pool.query<TInferredGameSegment>(
    `insert into inferred_game_segments (
       play_session_id, tracked_account_id, legend_assumed, opening_rank_score,
       opening_rank_name, opening_rank_division, ranked_map_code_open, ranked_map_name_open
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning ${SEGMENT_FIELDS}`,
    [
      input.playSessionId, input.trackedAccountId, input.legendAssumed, input.openingRankScore,
      input.openingRankName, input.openingRankDivision, input.rankedMapCode, input.rankedMapName
    ]
  );
  return result.rows[0];
}

export async function closeSegment(input: {
  segmentId: string;
  closingRankScore: number | null;
  rpDelta: number | null;
  confidence: string;
  mergeRisk: boolean;
  triggerSignals: Record<string, unknown>;
  closingRankName: string | null;
  closingRankDivision: string | null;
  rankedMapCode: string | null;
  rankedMapName: string | null;
}): Promise<void> {
  await pool.query(
    `update inferred_game_segments
     set
       ended_at = now(),
       closing_rank_score = $2,
       rp_delta = $3,
       confidence = $4,
       merge_risk = $5,
       trigger_signals = $6::jsonb,
       closing_rank_name = $7,
       closing_rank_division = $8,
       ranked_map_code_close = $9,
       ranked_map_name_close = $10
     where id = $1`,
    [
      input.segmentId,
      input.closingRankScore,
      input.rpDelta,
      input.confidence,
      input.mergeRisk,
      JSON.stringify(input.triggerSignals),
      input.closingRankName,
      input.closingRankDivision,
      input.rankedMapCode,
      input.rankedMapName
    ]
  );
}

export async function closeAllOpenSegmentsForAccount(
  trackedAccountId: string,
  closingRankScore: number | null,
  triggerSignals: Record<string, unknown>
): Promise<void> {
  await pool.query(
    `update inferred_game_segments
     set
       ended_at = now(),
       closing_rank_score = $2,
       rp_delta = case when opening_rank_score is not null and $2 is not null
                       then $2 - opening_rank_score else null end,
       confidence = 'low',
       trigger_signals = $3::jsonb
     where tracked_account_id = $1 and ended_at is null`,
    [trackedAccountId, closingRankScore, JSON.stringify(triggerSignals)]
  );
}

export async function getSegmentsBySession(
  playSessionId: string
): Promise<TInferredGameSegment[]> {
  const result = await pool.query<TInferredGameSegment>(
    `select ${SEGMENT_FIELDS}
     from inferred_game_segments
     where play_session_id = $1
     order by started_at asc`,
    [playSessionId]
  );
  return result.rows;
}

export async function getRecentSegmentsByAccount(
  trackedAccountId: string,
  limit = 50
): Promise<TInferredGameSegment[]> {
  const result = await pool.query<TInferredGameSegment>(
    `select ${SEGMENT_FIELDS}
     from inferred_game_segments
     where tracked_account_id = $1
     order by started_at desc
     limit $2`,
    [trackedAccountId, limit]
  );
  return result.rows;
}

export type TLegendAggregate = {
  legend: string;
  games: number;
  totalRpDelta: number;
  avgRpDelta: number;
  wins: number;
  losses: number;
};

export async function getLegendAggregatesByAccount(
  trackedAccountId: string,
  hours = 168
): Promise<TLegendAggregate[]> {
  const result = await pool.query<TLegendAggregate>(
    `select
       legend_assumed as "legend",
       count(*)::int as "games",
       coalesce(sum(rp_delta), 0)::int as "totalRpDelta",
       coalesce(round(avg(rp_delta)), 0)::int as "avgRpDelta",
       count(*) filter (where rp_delta > 0)::int as "wins",
       count(*) filter (where rp_delta < 0)::int as "losses"
     from inferred_game_segments
     where tracked_account_id = $1
       and ended_at is not null
       and legend_assumed is not null
       and started_at >= now() - ($2::int * interval '1 hour')
     group by legend_assumed
     order by count(*) desc`,
    [trackedAccountId, hours]
  );
  return result.rows;
}

export type TMapAggregate = {
  mapName: string;
  games: number;
  totalRpDelta: number;
  avgRpDelta: number;
};

export async function getMapAggregatesByAccount(
  trackedAccountId: string,
  hours = 168
): Promise<TMapAggregate[]> {
  const result = await pool.query<TMapAggregate>(
    `select
       coalesce(ranked_map_name_close, ranked_map_name_open) as "mapName",
       count(*)::int as "games",
       coalesce(sum(rp_delta), 0)::int as "totalRpDelta",
       coalesce(round(avg(rp_delta)), 0)::int as "avgRpDelta"
     from inferred_game_segments
     where tracked_account_id = $1
       and ended_at is not null
       and coalesce(ranked_map_name_close, ranked_map_name_open) is not null
       and started_at >= now() - ($2::int * interval '1 hour')
     group by coalesce(ranked_map_name_close, ranked_map_name_open)
     order by count(*) desc`,
    [trackedAccountId, hours]
  );
  return result.rows;
}
