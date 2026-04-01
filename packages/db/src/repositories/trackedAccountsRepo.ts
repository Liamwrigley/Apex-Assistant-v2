import { AppError, type TPlatform, type TTrackedAccount } from "@apex-assistant/core";
import { pool } from "../client.js";

type TTrackInsert = {
  guildId: string;
  ownerUserId: string;
  ign: string;
  platform: TPlatform;
  externalPlayerId?: string | null;
  externalSource?: string | null;
};

const ACCOUNT_FIELDS = `
  id,
  guild_id as "guildId",
  owner_user_id as "ownerUserId",
  (select display_name from users where discord_user_id = owner_user_id) as "ownerDisplayName",
  ign,
  platform,
  external_player_id as "externalPlayerId",
  external_source as "externalSource",
  is_active as "isActive",
  created_at as "createdAt",
  updated_at as "updatedAt",
  last_checked_at as "lastCheckedAt"
`;

/** Same shape as ACCOUNT_FIELDS but qualified for UPDATE ... FROM (avoids ambiguous "id" in RETURNING). */
const ACCOUNT_FIELDS_TA = `
  ta.id,
  ta.guild_id as "guildId",
  ta.owner_user_id as "ownerUserId",
  (select display_name from users u where u.discord_user_id = ta.owner_user_id) as "ownerDisplayName",
  ta.ign,
  ta.platform,
  ta.external_player_id as "externalPlayerId",
  ta.external_source as "externalSource",
  ta.is_active as "isActive",
  ta.created_at as "createdAt",
  ta.updated_at as "updatedAt",
  ta.last_checked_at as "lastCheckedAt"
`;

export async function addTrackedAccount(input: TTrackInsert): Promise<TTrackedAccount> {
  const existingByExternalId =
    input.externalPlayerId && input.externalSource
      ? await pool.query<{ id: string }>(
          `
          select id
          from tracked_accounts
          where guild_id = $1
            and is_active = true
            and platform = $2
            and external_source = $3
            and external_player_id = $4
          limit 1
          `,
          [input.guildId, input.platform, input.externalSource, input.externalPlayerId]
        )
      : null;

  if ((existingByExternalId?.rowCount ?? 0) > 0) {
    throw new AppError("This account is already tracked.", 409, "ACCOUNT_EXISTS");
  }

  const existingByCaseInsensitiveIgn = await pool.query<{ id: string }>(
    `
    select id
    from tracked_accounts
    where guild_id = $1
      and owner_user_id = $2
      and is_active = true
      and platform = $3
      and lower(ign) = lower($4)
    limit 1
    `,
    [input.guildId, input.ownerUserId, input.platform, input.ign]
  );

  if ((existingByCaseInsensitiveIgn.rowCount ?? 0) > 0) {
    throw new AppError("This account is already tracked.", 409, "ACCOUNT_EXISTS");
  }

  try {
    const result = await pool.query<TTrackedAccount>(
      `
      insert into tracked_accounts (guild_id, owner_user_id, ign, platform, external_player_id, external_source)
      values ($1, $2, $3, $4, $5, $6)
      returning ${ACCOUNT_FIELDS}
      `,
      [
        input.guildId,
        input.ownerUserId,
        input.ign,
        input.platform,
        input.externalPlayerId ?? null,
        input.externalSource ?? null
      ]
    );
    return result.rows[0];
  } catch {
    throw new AppError("This account is already tracked.", 409, "ACCOUNT_EXISTS");
  }
}

export async function removeTrackedAccount(input: TTrackInsert): Promise<boolean> {
  const result = await pool.query(
    `
    delete from tracked_accounts
    where guild_id = $1 and owner_user_id = $2 and ign = $3 and platform = $4
    `,
    [input.guildId, input.ownerUserId, input.ign, input.platform]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function listTrackedAccountsByOwner(guildId: string, ownerUserId: string): Promise<TTrackedAccount[]> {
  const result = await pool.query<TTrackedAccount>(
    `
    select ${ACCOUNT_FIELDS}
    from tracked_accounts
    where guild_id = $1 and owner_user_id = $2 and is_active = true
    order by created_at desc
    `,
    [guildId, ownerUserId]
  );
  return result.rows;
}

export async function searchTrackedAccountsByOwner(params: {
  guildId: string;
  ownerUserId: string;
  query: string;
  limit?: number;
}): Promise<TTrackedAccount[]> {
  const search = `%${params.query.trim()}%`;
  const limit = params.limit ?? 25;
  const result = await pool.query<TTrackedAccount>(
    `
    select ${ACCOUNT_FIELDS}
    from tracked_accounts
    where guild_id = $1
      and owner_user_id = $2
      and is_active = true
      and (ign ilike $3 or platform ilike $3)
    order by created_at desc
    limit $4
    `,
    [params.guildId, params.ownerUserId, search, limit]
  );
  return result.rows;
}

export async function listTrackedAccountsByGuild(guildId: string): Promise<TTrackedAccount[]> {
  const result = await pool.query<TTrackedAccount>(
    `
    select ${ACCOUNT_FIELDS}
    from tracked_accounts
    where guild_id = $1 and is_active = true
    order by created_at desc
    `,
    [guildId]
  );
  return result.rows;
}

export async function listTrackedAccounts(guildId?: string): Promise<TTrackedAccount[]> {
  const withGuildFilter = typeof guildId === "string" && guildId.length > 0;
  const result = await pool.query<TTrackedAccount>(
    `
    select ${ACCOUNT_FIELDS}
    from tracked_accounts
    where is_active = true
      and ($1::text is null or guild_id = $1)
    order by created_at desc
    `,
    [withGuildFilter ? guildId : null]
  );
  return result.rows;
}

export async function countTrackedByOwner(guildId: string, ownerUserId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `
    select count(*)::text as count
    from tracked_accounts
    where guild_id = $1 and owner_user_id = $2 and is_active = true
    `,
    [guildId, ownerUserId]
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function countTrackedByGuild(guildId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `
    select count(*)::text as count
    from tracked_accounts
    where guild_id = $1 and is_active = true
    `,
    [guildId]
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function updateTrackedAccountLastCheckedAt(trackedAccountId: string): Promise<void> {
  const result = await pool.query(
    `
    update tracked_accounts
    set
      last_checked_at = now(),
      updated_at = now()
    where id = $1
    returning id
    `,
    [trackedAccountId]
  );
  if (result.rowCount === 0) {
    console.warn(`[db] updateTrackedAccountLastCheckedAt: no row matched id=${trackedAccountId}`);
  }
}

export async function claimNextDueTrackedAccount(params: {
  pollMinutes: number;
  leaseSeconds: number;
  workerId: string;
  guildId?: string;
}): Promise<TTrackedAccount | null> {
  const pollMinutes = Math.max(1, Math.trunc(params.pollMinutes));
  const leaseSeconds = Math.max(30, Math.trunc(params.leaseSeconds));
  const withGuildFilter = typeof params.guildId === "string" && params.guildId.length > 0;

  const result = await pool.query<TTrackedAccount>(
    `
    with candidate as (
      select id
      from tracked_accounts
      where is_active = true
        and (ingest_claimed_until is null or ingest_claimed_until < now())
        and (last_checked_at is null or last_checked_at <= now() - ($1::int * interval '1 minute'))
        and ($2::text is null or guild_id = $2)
      order by coalesce(last_checked_at, to_timestamp(0)) asc
      for update skip locked
      limit 1
    )
    update tracked_accounts ta
    set
      ingest_claimed_until = now() + ($3::int * interval '1 second'),
      ingest_claimed_by = $4,
      updated_at = now()
    from candidate
    where ta.id = candidate.id
    returning ${ACCOUNT_FIELDS_TA}
    `,
    [pollMinutes, withGuildFilter ? params.guildId : null, leaseSeconds, params.workerId]
  );
  return result.rows[0] ?? null;
}

export async function releaseTrackedAccountClaim(trackedAccountId: string, workerId: string): Promise<void> {
  await pool.query(
    `
    update tracked_accounts
    set
      ingest_claimed_until = null,
      ingest_claimed_by = null,
      updated_at = now()
    where id = $1 and ingest_claimed_by = $2
    `,
    [trackedAccountId, workerId]
  );
}

export async function getIngestionQueueStats(guildId?: string): Promise<{
  activeCount: number;
  dueCount: number;
  claimedCount: number;
}> {
  const withGuildFilter = typeof guildId === "string" && guildId.length > 0;
  const pollMinutes = Number(process.env.INGEST_POLL_MINUTES ?? 5);
  const result = await pool.query<{
    activeCount: string;
    dueCount: string;
    claimedCount: string;
  }>(
    `
    select
      count(*) filter (where is_active = true)::text as "activeCount",
      count(*) filter (
        where is_active = true
          and (ingest_claimed_until is null or ingest_claimed_until < now())
          and (last_checked_at is null or last_checked_at <= now() - ($2::int * interval '1 minute'))
      )::text as "dueCount",
      count(*) filter (
        where is_active = true
          and ingest_claimed_until is not null
          and ingest_claimed_until >= now()
      )::text as "claimedCount"
    from tracked_accounts
    where ($1::text is null or guild_id = $1)
    `,
    [withGuildFilter ? guildId : null, Math.max(1, Math.trunc(pollMinutes))]
  );

  return {
    activeCount: Number(result.rows[0]?.activeCount ?? 0),
    dueCount: Number(result.rows[0]?.dueCount ?? 0),
    claimedCount: Number(result.rows[0]?.claimedCount ?? 0)
  };
}
