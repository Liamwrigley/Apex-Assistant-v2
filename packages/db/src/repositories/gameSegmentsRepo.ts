import { pool } from "../client.js";

/** Minimum segment length (seconds) to count toward profile/dashboard game stats; below this is treated as menu/lobby noise. Matches worker DURATION_PLAUSIBLE_MIN_SEC (90). */
export const SEGMENT_STATS_MIN_DURATION_SEC = 90;

type TSegmentStatsInput = {
  triggerSignals: Record<string, unknown>;
  rpDelta: number | null;
  startedAt: Date;
  endedAt: Date | null;
};

/**
 * Whether a closed segment should contribute to legend/map aggregates and “est. games” UI.
 * Drops: legend-select bridges, zero RP movement, and very short windows.
 */
export function segmentCountsAsInferredRankedGame(seg: TSegmentStatsInput): boolean {
  if (seg.endedAt == null) return true;

  if (seg.triggerSignals?.reason === "legend_change") return false;

  const durationSec =
    (new Date(seg.endedAt).getTime() - new Date(seg.startedAt).getTime()) / 1000;
  if (!Number.isFinite(durationSec) || durationSec < SEGMENT_STATS_MIN_DURATION_SEC) return false;

  if (seg.rpDelta === null || seg.rpDelta === 0) return false;

  return true;
}

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
  openingCareerKills: number | null;
  openingCareerDamage: number | null;
  openingCareerWins: number | null;
  closingCareerKills: number | null;
  closingCareerDamage: number | null;
  closingCareerWins: number | null;
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
  ranked_map_name_close as "rankedMapNameClose",
  opening_career_kills as "openingCareerKills",
  opening_career_damage as "openingCareerDamage",
  opening_career_wins as "openingCareerWins",
  closing_career_kills as "closingCareerKills",
  closing_career_damage as "closingCareerDamage",
  closing_career_wins as "closingCareerWins"
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
  openingCareerKills: number | null;
  openingCareerDamage: number | null;
  openingCareerWins: number | null;
}): Promise<TInferredGameSegment> {
  const result = await pool.query<TInferredGameSegment>(
    `insert into inferred_game_segments (
       play_session_id, tracked_account_id, legend_assumed, opening_rank_score,
       opening_rank_name, opening_rank_division, ranked_map_code_open, ranked_map_name_open,
       opening_career_kills, opening_career_damage, opening_career_wins
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     returning ${SEGMENT_FIELDS}`,
    [
      input.playSessionId, input.trackedAccountId, input.legendAssumed, input.openingRankScore,
      input.openingRankName, input.openingRankDivision, input.rankedMapCode, input.rankedMapName,
      input.openingCareerKills, input.openingCareerDamage, input.openingCareerWins
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
  closingCareerKills: number | null;
  closingCareerDamage: number | null;
  closingCareerWins: number | null;
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
       ranked_map_name_close = $10,
       closing_career_kills = $11,
       closing_career_damage = $12,
       closing_career_wins = $13
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
      input.rankedMapName,
      input.closingCareerKills,
      input.closingCareerDamage,
      input.closingCareerWins
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

/** Batch-fetch segments for multiple sessions in a single query. */
export async function getSegmentsBySessionIds(
  sessionIds: string[]
): Promise<Record<string, TInferredGameSegment[]>> {
  if (sessionIds.length === 0) return {};
  const result = await pool.query<TInferredGameSegment>(
    `select ${SEGMENT_FIELDS}
     from inferred_game_segments
     where play_session_id = any($1::uuid[])
     order by started_at asc`,
    [sessionIds]
  );
  const grouped: Record<string, TInferredGameSegment[]> = {};
  for (const row of result.rows) {
    (grouped[row.playSessionId] ??= []).push(row);
  }
  return grouped;
}

/**
 * For each tracked account that has an open (in-progress) game segment,
 * return the segment start time. Used to show "In game · Xm Ys" on live cards.
 */
export async function getOpenSegmentStartTimes(
  trackedAccountIds: string[]
): Promise<Record<string, Date>> {
  if (trackedAccountIds.length === 0) return {};
  const result = await pool.query<{ trackedAccountId: string; startedAt: Date }>(
    `select tracked_account_id as "trackedAccountId", started_at as "startedAt"
     from inferred_game_segments
     where tracked_account_id = any($1::uuid[])
       and ended_at is null`,
    [trackedAccountIds]
  );
  const map: Record<string, Date> = {};
  for (const row of result.rows) {
    map[row.trackedAccountId] = row.startedAt;
  }
  return map;
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

export type TRecentGameCell = {
  segmentId: string;
  trackedAccountId: string;
  startedAt: Date;
  endedAt: Date;
  legendAssumed: string | null;
  rpDelta: number;
  mapName: string | null;
};

/**
 * For each tracked account in `trackedAccountIds`, returns up to
 * `perAccountLimit` most-recent *closed* ranked games, newest first. Filters
 * match `segmentCountsAsInferredRankedGame` semantics so the result mirrors
 * what appears in "Est. games" elsewhere in the app.
 *
 * Powered by a single query using `row_number()` partitioned by account so we
 * avoid N round-trips on the dashboard leaderboard.
 */
export async function getRecentGamesByTrackedAccountIds(
  trackedAccountIds: string[],
  perAccountLimit = 30
): Promise<Record<string, TRecentGameCell[]>> {
  if (trackedAccountIds.length === 0) return {};
  const result = await pool.query<TRecentGameCell>(
    `select
       segment_id as "segmentId",
       tracked_account_id as "trackedAccountId",
       started_at as "startedAt",
       ended_at as "endedAt",
       legend_assumed as "legendAssumed",
       rp_delta as "rpDelta",
       map_name as "mapName"
     from (
       select
         s.id as segment_id,
         s.tracked_account_id,
         s.started_at,
         s.ended_at,
         s.legend_assumed,
         s.rp_delta,
         coalesce(s.ranked_map_name_close, s.ranked_map_name_open) as map_name,
         row_number() over (
           partition by s.tracked_account_id
           order by s.started_at desc
         ) as rn
       from inferred_game_segments s
       where s.tracked_account_id = any($1::uuid[])
         and s.ended_at is not null
         and s.rp_delta is not null
         and s.rp_delta <> 0
         and extract(epoch from (s.ended_at - s.started_at)) >= $2
         and (s.trigger_signals->>'reason') is distinct from 'legend_change'
     ) ranked
     where rn <= $3`,
    [trackedAccountIds, SEGMENT_STATS_MIN_DURATION_SEC, perAccountLimit]
  );
  const grouped: Record<string, TRecentGameCell[]> = {};
  for (const row of result.rows) {
    (grouped[row.trackedAccountId] ??= []).push(row);
  }
  return grouped;
}

export type TLegendAggregate = {
  legend: string;
  games: number;
  totalRpDelta: number;
  avgRpDelta: number;
  wins: number;
  losses: number;
  totalKills: number;
  totalDamage: number;
  avgKills: number;
  avgDamage: number;
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
       coalesce(round(avg(rp_delta)::numeric, 1), 0)::float as "avgRpDelta",
       count(*) filter (where rp_delta > 0)::int as "wins",
       count(*) filter (where rp_delta < 0)::int as "losses",
       coalesce(sum(closing_career_kills - opening_career_kills) filter (
         where opening_career_kills is not null and closing_career_kills is not null
       ), 0)::int as "totalKills",
       coalesce(sum(closing_career_damage - opening_career_damage) filter (
         where opening_career_damage is not null and closing_career_damage is not null
       ), 0)::int as "totalDamage",
       coalesce(round(avg(closing_career_kills - opening_career_kills) filter (
         where opening_career_kills is not null and closing_career_kills is not null
       )), 0)::int as "avgKills",
       coalesce(round(avg(closing_career_damage - opening_career_damage) filter (
         where opening_career_damage is not null and closing_career_damage is not null
       )), 0)::int as "avgDamage"
     from inferred_game_segments
     where tracked_account_id = $1
       and ended_at is not null
       and legend_assumed is not null
       and (trigger_signals->>'reason') is distinct from 'legend_change'
       and extract(epoch from (ended_at - started_at)) >= $3::double precision
       and rp_delta is not null
       and rp_delta <> 0
       and started_at >= now() - ($2::int * interval '1 hour')
     group by legend_assumed
     order by count(*) desc`,
    [trackedAccountId, hours, SEGMENT_STATS_MIN_DURATION_SEC]
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
       coalesce(ranked_map_name_open, ranked_map_name_close) as "mapName",
       count(*)::int as "games",
       coalesce(sum(rp_delta), 0)::int as "totalRpDelta",
       coalesce(round(avg(rp_delta)::numeric, 1), 0)::float as "avgRpDelta"
     from inferred_game_segments
     where tracked_account_id = $1
       and ended_at is not null
       and coalesce(ranked_map_name_open, ranked_map_name_close) is not null
       and (trigger_signals->>'reason') is distinct from 'legend_change'
       and extract(epoch from (ended_at - started_at)) >= $3::double precision
       and rp_delta is not null
       and rp_delta <> 0
       and started_at >= now() - ($2::int * interval '1 hour')
     group by coalesce(ranked_map_name_open, ranked_map_name_close)
     order by count(*) desc`,
    [trackedAccountId, hours, SEGMENT_STATS_MIN_DURATION_SEC]
  );
  return result.rows;
}

export type TMapLegendAggregate = {
  mapName: string;
  legend: string;
  games: number;
  totalRpDelta: number;
  avgRpDelta: number;
  wins: number;
  losses: number;
  totalKills: number;
  totalDamage: number;
  avgKills: number;
  avgDamage: number;
};

export async function getMapLegendAggregatesByAccount(
  trackedAccountId: string,
  hours = 168
): Promise<TMapLegendAggregate[]> {
  const result = await pool.query<TMapLegendAggregate>(
    `select
       coalesce(ranked_map_name_open, ranked_map_name_close) as "mapName",
       legend_assumed as "legend",
       count(*)::int as "games",
       coalesce(sum(rp_delta), 0)::int as "totalRpDelta",
       coalesce(round(avg(rp_delta)::numeric, 1), 0)::float as "avgRpDelta",
       count(*) filter (where rp_delta > 0)::int as "wins",
       count(*) filter (where rp_delta < 0)::int as "losses",
       coalesce(sum(closing_career_kills - opening_career_kills) filter (
         where opening_career_kills is not null and closing_career_kills is not null
       ), 0)::int as "totalKills",
       coalesce(sum(closing_career_damage - opening_career_damage) filter (
         where opening_career_damage is not null and closing_career_damage is not null
       ), 0)::int as "totalDamage",
       coalesce(round(avg(closing_career_kills - opening_career_kills) filter (
         where opening_career_kills is not null and closing_career_kills is not null
       )), 0)::int as "avgKills",
       coalesce(round(avg(closing_career_damage - opening_career_damage) filter (
         where opening_career_damage is not null and closing_career_damage is not null
       )), 0)::int as "avgDamage"
     from inferred_game_segments
     where tracked_account_id = $1
       and ended_at is not null
       and legend_assumed is not null
       and coalesce(ranked_map_name_open, ranked_map_name_close) is not null
       and (trigger_signals->>'reason') is distinct from 'legend_change'
       and extract(epoch from (ended_at - started_at)) >= $3::double precision
       and rp_delta is not null
       and rp_delta <> 0
       and started_at >= now() - ($2::int * interval '1 hour')
     group by coalesce(ranked_map_name_open, ranked_map_name_close), legend_assumed
     order by coalesce(ranked_map_name_open, ranked_map_name_close), sum(rp_delta) desc`,
    [trackedAccountId, hours, SEGMENT_STATS_MIN_DURATION_SEC]
  );
  return result.rows;
}
