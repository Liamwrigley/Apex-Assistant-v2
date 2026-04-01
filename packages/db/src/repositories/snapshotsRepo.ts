import { type TRankSnapshot } from "@apex-assistant/core";
import { pool } from "../client.js";

type TSnapshotInsert = {
  trackedAccountId: string;
  rankScore: number;
  rankName: string;
  rankDivision: string | null;
  iconUrl: string | null;
  source: string;
};

export async function insertRankSnapshot(input: TSnapshotInsert): Promise<TRankSnapshot> {
  const result = await pool.query<TRankSnapshot>(
    `
    insert into rank_snapshots (tracked_account_id, rank_score, rank_name, rank_division, icon_url, source)
    values ($1, $2, $3, $4, $5, $6)
    returning
      id,
      tracked_account_id as "trackedAccountId",
      captured_at as "capturedAt",
      rank_score as "rankScore",
      rank_name as "rankName",
      rank_division as "rankDivision",
      icon_url as "iconUrl",
      source
    `,
    [input.trackedAccountId, input.rankScore, input.rankName, input.rankDivision, input.iconUrl, input.source]
  );
  return result.rows[0];
}

export async function getLatestRankSnapshotByGuild(guildId: string): Promise<
  Array<{
    ign: string;
    platform: string;
    ownerUserId: string;
    rankScore: number;
    rankName: string;
    capturedAt: Date;
  }>
> {
  const result = await pool.query(
    `
    select distinct on (ta.id)
      ta.ign,
      ta.platform,
      ta.owner_user_id as "ownerUserId",
      rs.rank_score as "rankScore",
      rs.rank_name as "rankName",
      rs.captured_at as "capturedAt"
    from tracked_accounts ta
    join rank_snapshots rs on rs.tracked_account_id = ta.id
    where ta.guild_id = $1 and ta.is_active = true
    order by ta.id, rs.captured_at desc
    `,
    [guildId]
  );
  return result.rows;
}

export async function getLatestRankSnapshot(guildId?: string): Promise<
  Array<{
    ign: string;
    platform: string;
    ownerUserId: string;
    guildId: string;
    rankScore: number;
    rankName: string;
    capturedAt: Date;
  }>
> {
  const withGuildFilter = typeof guildId === "string" && guildId.length > 0;
  const result = await pool.query(
    `
    select distinct on (ta.id)
      ta.ign,
      ta.platform,
      ta.owner_user_id as "ownerUserId",
      ta.guild_id as "guildId",
      rs.rank_score as "rankScore",
      rs.rank_name as "rankName",
      rs.captured_at as "capturedAt"
    from tracked_accounts ta
    join rank_snapshots rs on rs.tracked_account_id = ta.id
    where ta.is_active = true
      and ($1::text is null or ta.guild_id = $1)
    order by ta.id, rs.captured_at desc
    `,
    [withGuildFilter ? guildId : null]
  );
  return result.rows;
}

export async function getLeaderboardWithDelta24h(guildId?: string): Promise<
  Array<{
    trackedAccountId: string;
    ign: string;
    platform: string;
    ownerUserId: string;
    guildId: string;
    rankScore: number;
    rankName: string;
    capturedAt: Date;
    deltaRp24h: number | null;
  }>
> {
  const withGuildFilter = typeof guildId === "string" && guildId.length > 0;
  const result = await pool.query<{
    trackedAccountId: string;
    ign: string;
    platform: string;
    ownerUserId: string;
    guildId: string;
    rankScore: number;
    rankName: string;
    capturedAt: Date;
    deltaRp24h: number | null;
  }>(
    `
    with latest as (
      select distinct on (ta.id)
        ta.id as "trackedAccountId",
        ta.ign,
        ta.platform,
        ta.owner_user_id as "ownerUserId",
        ta.guild_id as "guildId",
        rs.rank_score as "rankScore",
        rs.rank_name as "rankName",
        rs.captured_at as "capturedAt"
      from tracked_accounts ta
      join rank_snapshots rs on rs.tracked_account_id = ta.id
      where ta.is_active = true
        and ($1::text is null or ta.guild_id = $1)
      order by ta.id, rs.captured_at desc
    ),
    deltas as (
      select
        ta.id as "trackedAccountId",
        (
          (array_agg(rs.rank_score order by rs.captured_at desc))[1] -
          (array_agg(rs.rank_score order by rs.captured_at asc))[1]
        )::int as "deltaRp24h"
      from tracked_accounts ta
      join rank_snapshots rs on rs.tracked_account_id = ta.id
      where ta.is_active = true
        and rs.captured_at >= now() - interval '24 hours'
        and ($1::text is null or ta.guild_id = $1)
      group by ta.id
      having count(*) >= 2
    )
    select
      l."trackedAccountId",
      l.ign,
      l.platform,
      l."ownerUserId",
      l."guildId",
      l."rankScore",
      l."rankName",
      l."capturedAt",
      d."deltaRp24h"
    from latest l
    left join deltas d on d."trackedAccountId" = l."trackedAccountId"
    `,
    [withGuildFilter ? guildId : null]
  );
  return result.rows;
}

export async function getRankTimelineByTrackedAccountId(
  trackedAccountId: string,
  hours = 24
): Promise<Array<{ capturedAt: Date; rankScore: number }>> {
  const clampedHours = Number.isFinite(hours) ? Math.min(Math.max(Math.trunc(hours), 1), 168) : 24;
  const result = await pool.query<{ capturedAt: Date; rankScore: number }>(
    `
    select
      rs.captured_at as "capturedAt",
      rs.rank_score as "rankScore"
    from rank_snapshots rs
    join tracked_accounts ta on ta.id = rs.tracked_account_id
    where rs.tracked_account_id = $1
      and ta.is_active = true
      and rs.captured_at >= now() - ($2::int * interval '1 hour')
    order by rs.captured_at asc
    `,
    [trackedAccountId, clampedHours]
  );
  return result.rows;
}

export async function getRankTimelinesByTrackedAccountIds(
  trackedAccountIds: string[],
  hours = 168
): Promise<Record<string, Array<{ capturedAt: Date; rankScore: number }>>> {
  if (trackedAccountIds.length === 0) {
    return {};
  }

  const clampedHours = Number.isFinite(hours) ? Math.min(Math.max(Math.trunc(hours), 1), 168) : 168;
  const result = await pool.query<{ trackedAccountId: string; capturedAt: Date; rankScore: number }>(
    `
    with filtered as (
      select
        rs.tracked_account_id as tracked_id,
        rs.captured_at,
        rs.rank_score,
        date_trunc('hour', rs.captured_at) as bucket_hour
      from rank_snapshots rs
      join tracked_accounts ta on ta.id = rs.tracked_account_id
      where rs.tracked_account_id = any($1::uuid[])
        and ta.is_active = true
        and rs.captured_at >= now() - ($2::int * interval '1 hour')
    ),
    hourly as (
      select distinct on (tracked_id, bucket_hour)
        tracked_id as "trackedAccountId",
        captured_at as "capturedAt",
        rank_score as "rankScore",
        bucket_hour
      from filtered
      order by tracked_id, bucket_hour, captured_at desc
    )
    select "trackedAccountId", "capturedAt", "rankScore"
    from hourly
    order by "trackedAccountId", "capturedAt" asc
    `,
    [trackedAccountIds, clampedHours]
  );

  const grouped: Record<string, Array<{ capturedAt: Date; rankScore: number }>> = {};
  for (const row of result.rows) {
    if (!grouped[row.trackedAccountId]) {
      grouped[row.trackedAccountId] = [];
    }
    grouped[row.trackedAccountId].push({ capturedAt: row.capturedAt, rankScore: row.rankScore });
  }
  return grouped;
}

export async function getRankMovers24h(guildId?: string): Promise<{
  highestGainer: { ign: string; platform: string; deltaRp: number } | null;
  biggestLoser: { ign: string; platform: string; deltaRp: number } | null;
}> {
  const withGuildFilter = typeof guildId === "string" && guildId.length > 0;
  const result = await pool.query<{
    ign: string;
    platform: string;
    deltaRp: number;
  }>(
    `
    with in_window as (
      select
        ta.id as tracked_id,
        ta.ign,
        ta.platform,
        rs.rank_score,
        rs.captured_at
      from tracked_accounts ta
      join rank_snapshots rs on rs.tracked_account_id = ta.id
      where ta.is_active = true
        and rs.captured_at >= now() - interval '24 hours'
        and ($1::text is null or ta.guild_id = $1)
    ),
    deltas as (
      select
        tracked_id,
        max(ign) as ign,
        max(platform) as platform,
        (
          (array_agg(rank_score order by captured_at desc))[1] -
          (array_agg(rank_score order by captured_at asc))[1]
        )::int as "deltaRp",
        count(*) as points
      from in_window
      group by tracked_id
      having count(*) >= 2
    )
    select ign, platform, "deltaRp"
    from deltas
    `,
    [withGuildFilter ? guildId : null]
  );

  if (result.rows.length === 0) {
    return { highestGainer: null, biggestLoser: null };
  }

  const sorted = [...result.rows].sort((a, b) => b.deltaRp - a.deltaRp);
  const highestGainer = sorted[0] ?? null;
  const loserCandidate = sorted[sorted.length - 1] ?? null;
  return {
    highestGainer,
    biggestLoser: loserCandidate && loserCandidate.deltaRp < 0 ? loserCandidate : null
  };
}
