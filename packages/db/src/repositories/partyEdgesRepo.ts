import { pool } from "../client.js";
import { SEGMENT_STATS_MIN_DURATION_SEC } from "./gameSegmentsRepo.js";

export type TPartySegmentEdge = {
  id: string;
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
       (segment_id_a, segment_id_b, tracked_account_id_a, tracked_account_id_b, score, evidence)
     values ($1, $2, $3, $4, $5, $6::jsonb)
     on conflict (segment_id_a, segment_id_b)
     do update set score = excluded.score, evidence = excluded.evidence`,
    [segA, segB, accA, accB, input.score, JSON.stringify(input.evidence)],
  );
}

/** Recent edges for debug view. */
export async function getRecentPartyEdges(
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
  const result = await pool.query(
    `select
       e.id,
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
     order by e.created_at desc
     limit $1`,
    [limit],
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
  minScore = 0.2,
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
  minScore = 0.2,
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
       coalesce(seg.ranked_map_name_close, seg.ranked_map_name_open) as "mapName",
       count(*)::int as games,
       coalesce(round(avg(seg.rp_delta)::numeric, 1), 0)::float as "avgRpDelta",
       coalesce(sum(seg.rp_delta), 0)::int as "totalRpDelta"
     from edges e
     join inferred_game_segments seg on seg.id = e.my_seg_id
     join tracked_accounts ta on ta.id = $2::uuid
     where seg.legend_assumed is not null
     group by ta.ign, seg.legend_assumed,
              coalesce(seg.ranked_map_name_close, seg.ranked_map_name_open)
     order by count(*) desc`,
    [trackedAccountId, teammateAccountId, hours, minScore],
  );
  return result.rows;
}

export type TStackCompositionMember = {
  id: string;
  ign: string;
  platform: string;
};

export type TStackComposition = {
  memberIds: string[];
  members: TStackCompositionMember[];
  games: number;
  totalRpDelta: number;
  avgRpDelta: number;
  lastPlayedAt: Date;
};

/**
 * Groups games by exact party composition (the set of teammates present).
 * A duo row (A+B) only includes games where exactly B was matched;
 * a trio row (A+B+C) only includes games where both B and C were matched.
 */
export async function getStackCompositions(
  trackedAccountId: string,
  hours = 168,
  minScore = 0.2,
): Promise<TStackComposition[]> {
  const result = await pool.query(
    `with my_edges as (
       select
         case when tracked_account_id_a = $1::uuid then segment_id_a
              else segment_id_b end as my_seg_id,
         case when tracked_account_id_a = $1::uuid then tracked_account_id_b
              else tracked_account_id_a end as mate_id
       from party_segment_edges
       where (tracked_account_id_a = $1::uuid or tracked_account_id_b = $1::uuid)
         and score >= $3
         and created_at >= now() - ($2::int * interval '1 hour')
     ),
     seg_stacks as (
       select
         my_seg_id,
         array_agg(mate_id::text order by mate_id) as stack_key
       from my_edges
       group by my_seg_id
     ),
     stack_agg as (
       select
         ss.stack_key,
         count(*)::int as games,
         coalesce(sum(seg.rp_delta), 0)::int as "totalRpDelta",
         coalesce(round(avg(seg.rp_delta)::numeric, 1), 0)::float as "avgRpDelta",
         max(seg.started_at) as "lastPlayedAt"
       from seg_stacks ss
       join inferred_game_segments seg on seg.id = ss.my_seg_id
       group by ss.stack_key
     )
     select
       sa.stack_key as "memberIds",
       sa.games,
       sa."totalRpDelta",
       sa."avgRpDelta",
       sa."lastPlayedAt",
       (
         select coalesce(
           json_agg(json_build_object('id', ta.id, 'ign', ta.ign, 'platform', ta.platform) order by ta.id),
           '[]'::json
         )
         from tracked_accounts ta
         where ta.id::text = any(sa.stack_key)
       ) as members
     from stack_agg sa
     order by sa.games desc, sa."avgRpDelta" desc`,
    [trackedAccountId, hours, minScore],
  );
  return result.rows as TStackComposition[];
}

export type TStackCompositionBreakdown = {
  myLegend: string | null;
  mapName: string | null;
  /** Teammate legends in the same order as the sorted memberIds */
  mateLegends: (string | null)[];
  games: number;
  avgRpDelta: number;
  totalRpDelta: number;
};

/**
 * Legend × map breakdown for games played with an exact party composition.
 * Groups by the full legend lineup (player + each teammate) and map.
 * `teammateIds` must be the sorted array of teammate account IDs (same order
 * as `memberIds` returned by `getStackCompositions`).
 * `mateLegends` is returned in the same sort-by-mate-id order.
 */
export async function getStackCompositionBreakdown(
  trackedAccountId: string,
  teammateIds: string[],
  hours = 168,
  minScore = 0.2,
): Promise<TStackCompositionBreakdown[]> {
  const sortedIds = [...teammateIds].sort();
  const result = await pool.query<TStackCompositionBreakdown>(
    `with my_edges as (
       select
         case when tracked_account_id_a = $1::uuid then segment_id_a
              else segment_id_b end as my_seg_id,
         case when tracked_account_id_a = $1::uuid then tracked_account_id_b
              else tracked_account_id_a end as mate_id,
         case when tracked_account_id_a = $1::uuid then segment_id_b
              else segment_id_a end as mate_seg_id
       from party_segment_edges
       where (tracked_account_id_a = $1::uuid or tracked_account_id_b = $1::uuid)
         and score >= $4
         and created_at >= now() - ($3::int * interval '1 hour')
     ),
     seg_stacks as (
       select
         my_seg_id,
         array_agg(mate_id::text order by mate_id) as stack_key
       from my_edges
       group by my_seg_id
     ),
     matching_segs as (
       select my_seg_id
       from seg_stacks
       where stack_key = $2::text[]
     ),
     seg_lineups as (
       select
         ms.my_seg_id,
         seg.legend_assumed as my_legend,
         coalesce(seg.ranked_map_name_close, seg.ranked_map_name_open) as map_name,
         seg.rp_delta,
         array_agg(mate_seg.legend_assumed order by e.mate_id) as mate_legend_arr
       from matching_segs ms
       join inferred_game_segments seg on seg.id = ms.my_seg_id
       join my_edges e on e.my_seg_id = ms.my_seg_id
                      and e.mate_id::text = any($2::text[])
       join inferred_game_segments mate_seg on mate_seg.id = e.mate_seg_id
       where seg.legend_assumed is not null
       group by ms.my_seg_id, seg.legend_assumed,
                seg.ranked_map_name_close, seg.ranked_map_name_open,
                seg.rp_delta
     )
     select
       my_legend as "myLegend",
       map_name as "mapName",
       mate_legend_arr as "mateLegends",
       count(*)::int as games,
       coalesce(round(avg(rp_delta)::numeric, 1), 0)::float as "avgRpDelta",
       coalesce(sum(rp_delta), 0)::int as "totalRpDelta"
     from seg_lineups
     group by my_legend, map_name, mate_legend_arr
     order by count(*) desc`,
    [trackedAccountId, sortedIds, hours, minScore],
  );
  return result.rows;
}

export type TBestStackByMap = {
  mapName: string;
  memberIds: string[];
  members: TStackCompositionMember[];
  myLegend: string | null;
  /** Teammate legends in the same order as sorted memberIds */
  mateLegends: (string | null)[];
  games: number;
  avgRpDelta: number;
  totalRpDelta: number;
};

/**
 * For each map, returns the best (composition + legend lineup) by avg RP.
 * Requires at least 2 games per grouping to avoid noise.
 */
export async function getBestStackByMap(
  trackedAccountId: string,
  hours = 168,
  minScore = 0.2,
): Promise<TBestStackByMap[]> {
  const result = await pool.query(
    `with my_edges as (
       select
         case when tracked_account_id_a = $1::uuid then segment_id_a
              else segment_id_b end as my_seg_id,
         case when tracked_account_id_a = $1::uuid then tracked_account_id_b
              else tracked_account_id_a end as mate_id,
         case when tracked_account_id_a = $1::uuid then segment_id_b
              else segment_id_a end as mate_seg_id
       from party_segment_edges
       where (tracked_account_id_a = $1::uuid or tracked_account_id_b = $1::uuid)
         and score >= $3
         and created_at >= now() - ($2::int * interval '1 hour')
     ),
     seg_stacks as (
       select
         my_seg_id,
         array_agg(mate_id::text order by mate_id) as stack_key
       from my_edges
       group by my_seg_id
     ),
     seg_lineups as (
       select
         ss.my_seg_id,
         ss.stack_key,
         seg.legend_assumed as my_legend,
         coalesce(seg.ranked_map_name_close, seg.ranked_map_name_open) as map_name,
         seg.rp_delta,
         array_agg(mate_seg.legend_assumed order by e.mate_id) as mate_legend_arr
       from seg_stacks ss
       join inferred_game_segments seg on seg.id = ss.my_seg_id
       join my_edges e on e.my_seg_id = ss.my_seg_id
       join inferred_game_segments mate_seg on mate_seg.id = e.mate_seg_id
       where seg.legend_assumed is not null
         and coalesce(seg.ranked_map_name_close, seg.ranked_map_name_open) is not null
       group by ss.my_seg_id, ss.stack_key, seg.legend_assumed,
                seg.ranked_map_name_close, seg.ranked_map_name_open, seg.rp_delta
     ),
     map_comp_legend_agg as (
       select
         stack_key,
         map_name,
         my_legend,
         mate_legend_arr,
         count(*)::int as games,
         coalesce(round(avg(rp_delta)::numeric, 1), 0)::float as avg_rp,
         coalesce(sum(rp_delta), 0)::int as total_rp
       from seg_lineups
       group by stack_key, map_name, my_legend, mate_legend_arr
       having count(*) >= 2
     ),
     ranked as (
       select *,
         row_number() over (partition by map_name order by avg_rp desc) as rn
       from map_comp_legend_agg
     )
     select
       r.map_name as "mapName",
       r.stack_key as "memberIds",
       r.my_legend as "myLegend",
       r.mate_legend_arr as "mateLegends",
       r.games,
       r.avg_rp as "avgRpDelta",
       r.total_rp as "totalRpDelta",
       (
         select coalesce(
           json_agg(json_build_object('id', ta.id, 'ign', ta.ign, 'platform', ta.platform) order by ta.id),
           '[]'::json
         )
         from tracked_accounts ta
         where ta.id::text = any(r.stack_key)
       ) as members
     from ranked r
     where r.rn = 1
     order by r.avg_rp desc`,
    [trackedAccountId, hours, minScore],
  );
  return result.rows as TBestStackByMap[];
}

/**
 * Returns groups of tracked account IDs that appear to be partied right now.
 * Combines two signals:
 *  1. Players sharing an active Discord voice channel
 *  2. Players linked by recent party edges (last `recentMinutes`)
 */
export async function getActivePartyGroups(
  trackedAccountIds: string[],
  recentMinutes = 60,
): Promise<string[][]> {
  if (trackedAccountIds.length === 0) return [];

  const vcResult = await pool.query<{ channelId: string; trackedAccountId: string }>(
    `select vi.channel_id as "channelId", ta.id as "trackedAccountId"
     from discord_voice_intervals vi
     join tracked_accounts ta on ta.owner_user_id = vi.discord_user_id
     where ta.id = any($1::uuid[])
       and (vi.left_at is null or vi.left_at > now() - interval '15 minutes')
     order by vi.joined_at desc`,
    [trackedAccountIds],
  );

  const edgeResult = await pool.query<{ a: string; b: string }>(
    `select distinct e.tracked_account_id_a as a, e.tracked_account_id_b as b
     from party_segment_edges e
     join inferred_game_segments seg_a on seg_a.id = e.segment_id_a
     join inferred_game_segments seg_b on seg_b.id = e.segment_id_b
     where e.tracked_account_id_a = any($1::uuid[])
       and e.tracked_account_id_b = any($1::uuid[])
       and (seg_a.ended_at is null or seg_a.ended_at > now() - ($2::int * interval '1 minute'))
       and (seg_b.ended_at is null or seg_b.ended_at > now() - ($2::int * interval '1 minute'))
       and e.score >= 0.25`,
    [trackedAccountIds, recentMinutes],
  );

  // Union-Find
  const parent = new Map<string, string>();
  function find(x: string): string {
    if (!parent.has(x)) parent.set(x, x);
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = x;
    while (c !== r) { const next = parent.get(c)!; parent.set(c, r); c = next; }
    return r;
  }
  function union(a: string, b: string) { parent.set(find(a), find(b)); }

  // VC grouping — group by channel
  const vcByChannel = new Map<string, string[]>();
  for (const row of vcResult.rows) {
    const list = vcByChannel.get(row.channelId) ?? [];
    if (!list.includes(row.trackedAccountId)) list.push(row.trackedAccountId);
    vcByChannel.set(row.channelId, list);
  }
  for (const members of vcByChannel.values()) {
    for (let i = 1; i < members.length; i++) union(members[0], members[i]);
  }

  // Edge grouping
  for (const { a, b } of edgeResult.rows) union(a, b);

  // Collect groups (only those with 2+ live members)
  const liveSet = new Set(trackedAccountIds);
  const groups = new Map<string, string[]>();
  for (const id of trackedAccountIds) {
    if (!parent.has(id)) continue;
    const root = find(id);
    const list = groups.get(root) ?? [];
    if (liveSet.has(id)) list.push(id);
    groups.set(root, list);
  }

  return [...groups.values()].filter((g) => g.length >= 2);
}

export type TPartyMatchEdge = {
  edgeId: string;
  segmentIdA: string;
  segmentIdB: string;
  score: number;
  evidence: Record<string, unknown>;
  ignA: string;
  ignB: string;
  legendA: string | null;
  legendB: string | null;
  rpDeltaA: number | null;
  rpDeltaB: number | null;
  openingRankNameA: string | null;
  openingRankNameB: string | null;
  closingRankNameA: string | null;
  closingRankNameB: string | null;
  openingRankDivisionA: string | null;
  openingRankDivisionB: string | null;
  closingRankDivisionA: string | null;
  closingRankDivisionB: string | null;
  openingRankScoreA: number | null;
  openingRankScoreB: number | null;
  closingRankScoreA: number | null;
  closingRankScoreB: number | null;
  rankIconUrlA: string | null;
  rankIconUrlB: string | null;
  mapA: string | null;
  mapB: string | null;
  segStartA: Date;
  segStartB: Date;
  segEndA: Date;
  segEndB: Date;
  durationA: number;
  durationB: number;
};

/**
 * Edges enriched with map, rank, and duration for match history clustering.
 */
export async function getPartyMatchEdges(
  limit = 300,
): Promise<TPartyMatchEdge[]> {
  const result = await pool.query<TPartyMatchEdge>(
    `select
       e.id as "edgeId",
       e.segment_id_a as "segmentIdA",
       e.segment_id_b as "segmentIdB",
       e.score,
       e.evidence,
       ta_a.ign as "ignA",
       ta_b.ign as "ignB",
       seg_a.legend_assumed as "legendA",
       seg_b.legend_assumed as "legendB",
       seg_a.rp_delta as "rpDeltaA",
       seg_b.rp_delta as "rpDeltaB",
       seg_a.opening_rank_name as "openingRankNameA",
       seg_b.opening_rank_name as "openingRankNameB",
       seg_a.closing_rank_name as "closingRankNameA",
       seg_b.closing_rank_name as "closingRankNameB",
       seg_a.opening_rank_division as "openingRankDivisionA",
       seg_b.opening_rank_division as "openingRankDivisionB",
       seg_a.closing_rank_division as "closingRankDivisionA",
       seg_b.closing_rank_division as "closingRankDivisionB",
       seg_a.opening_rank_score as "openingRankScoreA",
       seg_b.opening_rank_score as "openingRankScoreB",
       seg_a.closing_rank_score as "closingRankScoreA",
       seg_b.closing_rank_score as "closingRankScoreB",
       ta_a.current_rank_icon_url as "rankIconUrlA",
       ta_b.current_rank_icon_url as "rankIconUrlB",
       coalesce(seg_a.ranked_map_name_close, seg_a.ranked_map_name_open) as "mapA",
       coalesce(seg_b.ranked_map_name_close, seg_b.ranked_map_name_open) as "mapB",
       seg_a.started_at as "segStartA",
       seg_b.started_at as "segStartB",
       seg_a.ended_at as "segEndA",
       seg_b.ended_at as "segEndB",
       extract(epoch from (seg_a.ended_at - seg_a.started_at))::int as "durationA",
       extract(epoch from (seg_b.ended_at - seg_b.started_at))::int as "durationB"
     from party_segment_edges e
     join inferred_game_segments seg_a on seg_a.id = e.segment_id_a
     join inferred_game_segments seg_b on seg_b.id = e.segment_id_b
     join tracked_accounts ta_a on ta_a.id = e.tracked_account_id_a
     join tracked_accounts ta_b on ta_b.id = e.tracked_account_id_b
     order by least(seg_a.started_at, seg_b.started_at) desc
     limit $1`,
    [limit],
  );
  return result.rows;
}

/**
 * Same as getPartyMatchEdges but filtered to edges involving a specific account.
 */
export async function getPartyMatchEdgesByAccount(
  trackedAccountId: string,
  limit = 300,
): Promise<TPartyMatchEdge[]> {
  const result = await pool.query<TPartyMatchEdge>(
    `select
       e.id as "edgeId",
       e.segment_id_a as "segmentIdA",
       e.segment_id_b as "segmentIdB",
       e.score,
       e.evidence,
       ta_a.ign as "ignA",
       ta_b.ign as "ignB",
       seg_a.legend_assumed as "legendA",
       seg_b.legend_assumed as "legendB",
       seg_a.rp_delta as "rpDeltaA",
       seg_b.rp_delta as "rpDeltaB",
       seg_a.opening_rank_name as "openingRankNameA",
       seg_b.opening_rank_name as "openingRankNameB",
       seg_a.closing_rank_name as "closingRankNameA",
       seg_b.closing_rank_name as "closingRankNameB",
       seg_a.opening_rank_division as "openingRankDivisionA",
       seg_b.opening_rank_division as "openingRankDivisionB",
       seg_a.closing_rank_division as "closingRankDivisionA",
       seg_b.closing_rank_division as "closingRankDivisionB",
       seg_a.opening_rank_score as "openingRankScoreA",
       seg_b.opening_rank_score as "openingRankScoreB",
       seg_a.closing_rank_score as "closingRankScoreA",
       seg_b.closing_rank_score as "closingRankScoreB",
       ta_a.current_rank_icon_url as "rankIconUrlA",
       ta_b.current_rank_icon_url as "rankIconUrlB",
       coalesce(seg_a.ranked_map_name_close, seg_a.ranked_map_name_open) as "mapA",
       coalesce(seg_b.ranked_map_name_close, seg_b.ranked_map_name_open) as "mapB",
       seg_a.started_at as "segStartA",
       seg_b.started_at as "segStartB",
       seg_a.ended_at as "segEndA",
       seg_b.ended_at as "segEndB",
       extract(epoch from (seg_a.ended_at - seg_a.started_at))::int as "durationA",
       extract(epoch from (seg_b.ended_at - seg_b.started_at))::int as "durationB"
     from party_segment_edges e
     join inferred_game_segments seg_a on seg_a.id = e.segment_id_a
     join inferred_game_segments seg_b on seg_b.id = e.segment_id_b
     join tracked_accounts ta_a on ta_a.id = e.tracked_account_id_a
     join tracked_accounts ta_b on ta_b.id = e.tracked_account_id_b
     where e.tracked_account_id_a = $1::uuid
        or e.tracked_account_id_b = $1::uuid
     order by least(seg_a.started_at, seg_b.started_at) desc
     limit $2`,
    [trackedAccountId, limit],
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
