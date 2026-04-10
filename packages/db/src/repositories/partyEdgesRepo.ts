import { pool } from "../client.js";
import { SEGMENT_STATS_MIN_DURATION_SEC } from "./gameSegmentsRepo.js";

export type TPartySegmentEdge = {
  id: string;
  guildId: string;
  segmentIdA: string;
  segmentIdB: string;
  trackedAccountIdA: string;
  trackedAccountIdB: string;
  score: number;
  evidence: Record<string, unknown>;
  createdAt: Date;
};

const FIELDS = `
  id,
  guild_id as "guildId",
  segment_id_a as "segmentIdA",
  segment_id_b as "segmentIdB",
  tracked_account_id_a as "trackedAccountIdA",
  tracked_account_id_b as "trackedAccountIdB",
  score,
  evidence,
  created_at as "createdAt"
`;

/**
 * Upsert a party edge between two segments (ordered by id to avoid duplicates).
 * If the edge already exists, update the score and evidence.
 */
export async function upsertPartyEdge(input: {
  guildId: string;
  segmentIdA: string;
  segmentIdB: string;
  trackedAccountIdA: string;
  trackedAccountIdB: string;
  score: number;
  evidence: Record<string, unknown>;
}): Promise<void> {
  const [segA, segB] = input.segmentIdA < input.segmentIdB
    ? [input.segmentIdA, input.segmentIdB]
    : [input.segmentIdB, input.segmentIdA];
  const [accA, accB] = input.segmentIdA < input.segmentIdB
    ? [input.trackedAccountIdA, input.trackedAccountIdB]
    : [input.trackedAccountIdB, input.trackedAccountIdA];

  await pool.query(
    `insert into party_segment_edges
       (guild_id, segment_id_a, segment_id_b, tracked_account_id_a, tracked_account_id_b, score, evidence)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb)
     on conflict (segment_id_a, segment_id_b)
     do update set score = excluded.score, evidence = excluded.evidence`,
    [input.guildId, segA, segB, accA, accB, input.score, JSON.stringify(input.evidence)],
  );
}

/** Recent edges for debug view. */
export async function getRecentPartyEdges(
  guildId?: string,
  limit = 200,
): Promise<Array<
  TPartySegmentEdge & {
    ignA: string;
    ignB: string;
    legendA: string | null;
    legendB: string | null;
    rpDeltaA: number | null;
    rpDeltaB: number | null;
    segStartA: Date;
    segStartB: Date;
  }
>> {
  const hasGuild = typeof guildId === "string" && guildId.length > 0;
  const result = await pool.query(
    `select
       e.id,
       e.guild_id as "guildId",
       e.segment_id_a as "segmentIdA",
       e.segment_id_b as "segmentIdB",
       e.tracked_account_id_a as "trackedAccountIdA",
       e.tracked_account_id_b as "trackedAccountIdB",
       e.score,
       e.evidence,
       e.created_at as "createdAt",
       ta_a.ign as "ignA",
       ta_b.ign as "ignB",
       seg_a.legend_assumed as "legendA",
       seg_b.legend_assumed as "legendB",
       seg_a.rp_delta as "rpDeltaA",
       seg_b.rp_delta as "rpDeltaB",
       seg_a.started_at as "segStartA",
       seg_b.started_at as "segStartB"
     from party_segment_edges e
     join inferred_game_segments seg_a on seg_a.id = e.segment_id_a
     join inferred_game_segments seg_b on seg_b.id = e.segment_id_b
     join tracked_accounts ta_a on ta_a.id = e.tracked_account_id_a
     join tracked_accounts ta_b on ta_b.id = e.tracked_account_id_b
     where ($1::text is null or e.guild_id = $1)
     order by e.created_at desc
     limit $2`,
    [hasGuild ? guildId : null, limit],
  );
  return result.rows;
}

export type TStackMateSummary = {
  teammateAccountId: string;
  teammateIgn: string;
  teammatePlatform: string;
  games: number;
  totalRpDelta: number;
  avgRpDelta: number;
  avgScore: number;
  lastPlayedAt: Date;
};

/**
 * Aggregated "stack-mates" for a tracked account: who they play with most and how it went.
 * Only includes edges above a score threshold (default 0.3).
 */
export async function getStackMatesForAccount(
  trackedAccountId: string,
  hours = 168,
  minScore = 0.3,
): Promise<TStackMateSummary[]> {
  const result = await pool.query<TStackMateSummary>(
    `with edges as (
       select
         case when tracked_account_id_a = $1::uuid then tracked_account_id_b
              else tracked_account_id_a end as mate_id,
         case when tracked_account_id_a = $1::uuid then segment_id_a
              else segment_id_b end as my_seg_id,
         score,
         created_at
       from party_segment_edges
       where (tracked_account_id_a = $1::uuid or tracked_account_id_b = $1::uuid)
         and score >= $3
         and created_at >= now() - ($2::int * interval '1 hour')
     ),
     agg as (
       select
         e.mate_id,
         count(*)::int as games,
         coalesce(sum(seg.rp_delta), 0)::int as "totalRpDelta",
         coalesce(round(avg(seg.rp_delta)::numeric, 1), 0)::float as "avgRpDelta",
         round(avg(e.score)::numeric, 2)::float as "avgScore",
         max(e.created_at) as "lastPlayedAt"
       from edges e
       join inferred_game_segments seg on seg.id = e.my_seg_id
       group by e.mate_id
     )
     select
       a.mate_id as "teammateAccountId",
       ta.ign as "teammateIgn",
       ta.platform as "teammatePlatform",
       a.games,
       a."totalRpDelta",
       a."avgRpDelta",
       a."avgScore",
       a."lastPlayedAt"
     from agg a
     join tracked_accounts ta on ta.id = a.mate_id
     order by a.games desc, a."avgRpDelta" desc`,
    [trackedAccountId, hours, minScore],
  );
  return result.rows;
}

export type TStackLegendMapBreakdown = {
  teammateAccountId: string;
  teammateIgn: string;
  myLegend: string | null;
  mapName: string | null;
  games: number;
  avgRpDelta: number;
  totalRpDelta: number;
};

/**
 * Detailed legend × map breakdown for games played with a specific teammate.
 */
export async function getStackBreakdown(
  trackedAccountId: string,
  teammateAccountId: string,
  hours = 168,
  minScore = 0.3,
): Promise<TStackLegendMapBreakdown[]> {
  const result = await pool.query<TStackLegendMapBreakdown>(
    `with edges as (
       select
         case when tracked_account_id_a = $1::uuid then segment_id_a
              else segment_id_b end as my_seg_id,
         case when tracked_account_id_a = $1::uuid then tracked_account_id_b
              else tracked_account_id_a end as mate_id
       from party_segment_edges
       where (
         (tracked_account_id_a = $1::uuid and tracked_account_id_b = $2::uuid)
         or
         (tracked_account_id_a = $2::uuid and tracked_account_id_b = $1::uuid)
       )
       and score >= $4
       and created_at >= now() - ($3::int * interval '1 hour')
     )
     select
       $2::uuid as "teammateAccountId",
       ta.ign as "teammateIgn",
       seg.legend_assumed as "myLegend",
       coalesce(seg.ranked_map_name_open, seg.ranked_map_name_close) as "mapName",
       count(*)::int as games,
       coalesce(round(avg(seg.rp_delta)::numeric, 1), 0)::float as "avgRpDelta",
       coalesce(sum(seg.rp_delta), 0)::int as "totalRpDelta"
     from edges e
     join inferred_game_segments seg on seg.id = e.my_seg_id
     join tracked_accounts ta on ta.id = $2::uuid
     where seg.legend_assumed is not null
     group by ta.ign, seg.legend_assumed,
              coalesce(seg.ranked_map_name_open, seg.ranked_map_name_close)
     order by count(*) desc`,
    [trackedAccountId, teammateAccountId, hours, minScore],
  );
  return result.rows;
}

/**
 * Overall avg RP per game for a player over a time window (baseline for comparison).
 * Uses the same segment filters as legend aggregates for consistency.
 */
export async function getBaselineAvgRp(
  trackedAccountId: string,
  hours = 168,
): Promise<{ games: number; avgRpDelta: number } | null> {
  const result = await pool.query<{ games: number; avgRpDelta: number }>(
    `select
       count(*)::int as games,
       coalesce(round(avg(rp_delta)::numeric, 1), 0)::float as "avgRpDelta"
     from inferred_game_segments
     where tracked_account_id = $1
       and ended_at is not null
       and (trigger_signals->>'reason') is distinct from 'legend_change'
       and extract(epoch from (ended_at - started_at)) >= $3::double precision
       and rp_delta is not null
       and rp_delta <> 0
       and started_at >= now() - ($2::int * interval '1 hour')`,
    [trackedAccountId, hours, SEGMENT_STATS_MIN_DURATION_SEC],
  );
  const row = result.rows[0];
  return row && row.games > 0 ? row : null;
}
