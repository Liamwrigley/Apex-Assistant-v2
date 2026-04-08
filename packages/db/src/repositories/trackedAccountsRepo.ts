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
  identity_group_id as "identityGroupId",
  ign,
  platform,
  external_player_id as "externalPlayerId",
  external_source as "externalSource",
  is_active as "isActive",
  created_at as "createdAt",
  updated_at as "updatedAt",
  last_checked_at as "lastCheckedAt",
  current_level as "currentLevel",
  current_rank_name as "currentRankName",
  current_rank_division as "currentRankDivision",
  current_rank_icon_url as "currentRankIconUrl",
  career_kills as "careerKills",
  career_damage as "careerDamage",
  career_wins as "careerWins",
  realtime_lobby_state as "realtimeLobbyState",
  realtime_is_online as "realtimeIsOnline",
  realtime_is_in_game as "realtimeIsInGame",
  realtime_can_join as "realtimeCanJoin",
  realtime_party_full as "realtimePartyFull",
  realtime_selected_legend as "realtimeSelectedLegend",
  realtime_current_state as "realtimeCurrentState",
  realtime_current_state_as_text as "realtimeCurrentStateAsText",
  realtime_current_state_since_timestamp as "realtimeCurrentStateSinceTimestamp",
  realtime_updated_at as "realtimeUpdatedAt"
`;

/** Same shape as ACCOUNT_FIELDS but qualified for UPDATE ... FROM (avoids ambiguous "id" in RETURNING). */
const ACCOUNT_FIELDS_TA = `
  ta.id,
  ta.guild_id as "guildId",
  ta.owner_user_id as "ownerUserId",
  (select display_name from users u where u.discord_user_id = ta.owner_user_id) as "ownerDisplayName",
  ta.identity_group_id as "identityGroupId",
  ta.ign,
  ta.platform,
  ta.external_player_id as "externalPlayerId",
  ta.external_source as "externalSource",
  ta.is_active as "isActive",
  ta.created_at as "createdAt",
  ta.updated_at as "updatedAt",
  ta.last_checked_at as "lastCheckedAt",
  ta.current_level as "currentLevel",
  ta.career_kills as "careerKills",
  ta.career_damage as "careerDamage",
  ta.career_wins as "careerWins",
  ta.realtime_lobby_state as "realtimeLobbyState",
  ta.realtime_is_online as "realtimeIsOnline",
  ta.realtime_is_in_game as "realtimeIsInGame",
  ta.realtime_can_join as "realtimeCanJoin",
  ta.realtime_party_full as "realtimePartyFull",
  ta.realtime_selected_legend as "realtimeSelectedLegend",
  ta.realtime_current_state as "realtimeCurrentState",
  ta.realtime_current_state_as_text as "realtimeCurrentStateAsText",
  ta.realtime_current_state_since_timestamp as "realtimeCurrentStateSinceTimestamp",
  ta.realtime_updated_at as "realtimeUpdatedAt"
`;

/** List reads: show rank from latest rank_snapshots when denormalized current_rank_* on ta is null. */
const RANK_SNAPSHOT_FOR_LIST_LATERAL = `
left join lateral (
  select rank_name, rank_division, icon_url
  from rank_snapshots
  where tracked_account_id = ta.id
  order by captured_at desc
  limit 1
) lr on true
`;

const ACCOUNT_FIELDS_TA_LIST = `
  ta.id,
  ta.guild_id as "guildId",
  ta.owner_user_id as "ownerUserId",
  (select display_name from users where discord_user_id = ta.owner_user_id) as "ownerDisplayName",
  ta.identity_group_id as "identityGroupId",
  ta.ign,
  ta.platform,
  ta.external_player_id as "externalPlayerId",
  ta.external_source as "externalSource",
  ta.is_active as "isActive",
  ta.created_at as "createdAt",
  ta.updated_at as "updatedAt",
  ta.last_checked_at as "lastCheckedAt",
  ta.current_level as "currentLevel",
  coalesce(ta.current_rank_name, lr.rank_name) as "currentRankName",
  coalesce(ta.current_rank_division, lr.rank_division) as "currentRankDivision",
  coalesce(ta.current_rank_icon_url, lr.icon_url) as "currentRankIconUrl",
  ta.career_kills as "careerKills",
  ta.career_damage as "careerDamage",
  ta.career_wins as "careerWins",
  ta.realtime_lobby_state as "realtimeLobbyState",
  ta.realtime_is_online as "realtimeIsOnline",
  ta.realtime_is_in_game as "realtimeIsInGame",
  ta.realtime_can_join as "realtimeCanJoin",
  ta.realtime_party_full as "realtimePartyFull",
  ta.realtime_selected_legend as "realtimeSelectedLegend",
  ta.realtime_current_state as "realtimeCurrentState",
  ta.realtime_current_state_as_text as "realtimeCurrentStateAsText",
  ta.realtime_current_state_since_timestamp as "realtimeCurrentStateSinceTimestamp",
  ta.realtime_updated_at as "realtimeUpdatedAt"
`;

export async function getTrackedAccountById(id: string): Promise<TTrackedAccount | null> {
  const result = await pool.query<TTrackedAccount>(
    `select ${ACCOUNT_FIELDS} from tracked_accounts where id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

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
    select ${ACCOUNT_FIELDS_TA_LIST}
    from tracked_accounts ta
    ${RANK_SNAPSHOT_FOR_LIST_LATERAL}
    where ta.guild_id = $1 and ta.owner_user_id = $2 and ta.is_active = true
    order by ta.created_at desc
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
    select ${ACCOUNT_FIELDS_TA_LIST}
    from tracked_accounts ta
    ${RANK_SNAPSHOT_FOR_LIST_LATERAL}
    where ta.guild_id = $1
      and ta.owner_user_id = $2
      and ta.is_active = true
      and (ta.ign ilike $3 or ta.platform ilike $3)
    order by ta.created_at desc
    limit $4
    `,
    [params.guildId, params.ownerUserId, search, limit]
  );
  return result.rows;
}

export async function listTrackedAccountsByGuild(guildId: string): Promise<TTrackedAccount[]> {
  const result = await pool.query<TTrackedAccount>(
    `
    select ${ACCOUNT_FIELDS_TA_LIST}
    from tracked_accounts ta
    ${RANK_SNAPSHOT_FOR_LIST_LATERAL}
    where ta.guild_id = $1 and ta.is_active = true
    order by ta.created_at desc
    `,
    [guildId]
  );
  return result.rows;
}

export async function listTrackedAccounts(guildId?: string): Promise<TTrackedAccount[]> {
  const withGuildFilter = typeof guildId === "string" && guildId.length > 0;
  const result = await pool.query<TTrackedAccount>(
    `
    select ${ACCOUNT_FIELDS_TA_LIST}
    from tracked_accounts ta
    ${RANK_SNAPSHOT_FOR_LIST_LATERAL}
    where ta.is_active = true
      and ($1::text is null or ta.guild_id = $1)
    order by ta.created_at desc
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

export async function updateTrackedAccountCurrentRank(params: {
  trackedAccountId: string;
  rankName: string | null;
  rankDivision: string | null;
  iconUrl: string | null;
}): Promise<void> {
  await pool.query(
    `
    update tracked_accounts
    set
      current_rank_name = $2,
      current_rank_division = $3,
      current_rank_icon_url = $4,
      updated_at = now()
    where id = $1
    `,
    [params.trackedAccountId, params.rankName ?? null, params.rankDivision ?? null, params.iconUrl ?? null]
  );
}

export async function updateTrackedAccountLiveStats(params: {
  trackedAccountId: string;
  currentLevel?: number | null;
  careerKills?: number | null;
  careerDamage?: number | null;
  careerWins?: number | null;
  realtime?: {
    lobbyState?: string | null;
    isOnline?: number | null;
    isInGame?: number | null;
    canJoin?: number | null;
    partyFull?: number | null;
    selectedLegend?: string | null;
    currentState?: string | null;
    currentStateAsText?: string | null;
    currentStateSinceTimestamp?: number | null;
  } | null;
}): Promise<void> {
  await pool.query(
    `
    update tracked_accounts
    set
      current_level = $2,
      career_kills = $3,
      career_damage = $4,
      career_wins = $5,
      realtime_lobby_state = $6,
      realtime_is_online = $7,
      realtime_is_in_game = $8,
      realtime_can_join = $9,
      realtime_party_full = $10,
      realtime_selected_legend = $11,
      realtime_current_state = $12,
      realtime_current_state_as_text = $13,
      realtime_current_state_since_timestamp = $14,
      realtime_updated_at = now(),
      updated_at = now()
    where id = $1
    `,
    [
      params.trackedAccountId,
      params.currentLevel ?? null,
      params.careerKills ?? null,
      params.careerDamage ?? null,
      params.careerWins ?? null,
      params.realtime?.lobbyState ?? null,
      params.realtime?.isOnline ?? null,
      params.realtime?.isInGame ?? null,
      params.realtime?.canJoin ?? null,
      params.realtime?.partyFull ?? null,
      params.realtime?.selectedLegend ?? null,
      params.realtime?.currentState ?? null,
      params.realtime?.currentStateAsText ?? null,
      params.realtime?.currentStateSinceTimestamp ?? null
    ]
  );
}

export async function updateTrackedAccountIgnIfChanged(params: {
  trackedAccountId: string;
  ign: string;
}): Promise<boolean> {
  const nextIgn = params.ign.trim();
  if (!nextIgn) {
    return false;
  }
  try {
    const result = await pool.query<{ ign: string }>(
      `
      update tracked_accounts
      set
        ign = $2,
        updated_at = now()
      where id = $1
        and ign is distinct from $2
      returning ign
      `,
      [params.trackedAccountId, nextIgn]
    );
    return (result.rowCount ?? 0) > 0;
  } catch {
    // Avoid failing ingestion on rare name collisions; UUID remains canonical.
    return false;
  }
}

export async function updateTrackedAccountIgnById(params: {
  trackedAccountId: string;
  ign: string;
}): Promise<boolean> {
  const nextIgn = params.ign.trim();
  if (!nextIgn) {
    return false;
  }
  try {
    const result = await pool.query<{ ign: string }>(
      `
      update tracked_accounts
      set
        ign = $2,
        updated_at = now()
      where id = $1
      returning ign
      `,
      [params.trackedAccountId, nextIgn]
    );
    return (result.rowCount ?? 0) > 0;
  } catch {
    // Keep script/worker resilient to collisions; UUID remains canonical.
    return false;
  }
}

export async function hasIgnConflictForDifferentExternalId(params: {
  trackedAccountId: string;
  ign: string;
  externalPlayerId: string | null;
}): Promise<boolean> {
  const nextIgn = params.ign.trim();
  if (!nextIgn) {
    return false;
  }
  const result = await pool.query<{ id: string }>(
    `
    select id
    from tracked_accounts
    where is_active = true
      and id <> $1
      and lower(ign) = lower($2)
      and (
        external_player_id is distinct from $3
      )
    limit 1
    `,
    [params.trackedAccountId, nextIgn, params.externalPlayerId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function autoLinkTrackedAccountByExactFingerprint(params: {
  trackedAccountId: string;
  actorUserId: string;
}): Promise<{ linked: boolean; identityGroupId: string | null }> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const current = await client.query<{
      id: string;
      guildId: string;
      ownerUserId: string;
      platform: TPlatform;
      ign: string;
      identityGroupId: string | null;
      currentLevel: number | null;
      careerKills: number | null;
      careerDamage: number | null;
      careerWins: number | null;
    }>(
      `
      select
        id,
        guild_id as "guildId",
        owner_user_id as "ownerUserId",
        platform,
        ign,
        identity_group_id as "identityGroupId",
        current_level as "currentLevel",
        career_kills as "careerKills",
        career_damage as "careerDamage",
        career_wins as "careerWins"
      from tracked_accounts
      where id = $1 and is_active = true
      for update
      `,
      [params.trackedAccountId]
    );
    const row = current.rows[0];
    if (!row) {
      await client.query("rollback");
      return { linked: false, identityGroupId: null };
    }

    const peerResult = await client.query<{
      id: string;
      identityGroupId: string | null;
    }>(
      `
      select
        id,
        identity_group_id as "identityGroupId"
      from tracked_accounts
      where is_active = true
        and id <> $1
        and guild_id = $2
        and owner_user_id = $3
        and platform <> $4
        and lower(trim(ign)) = lower(trim($5))
      order by created_at asc
      limit 1
      for update
      `,
      [
        row.id,
        row.guildId,
        row.ownerUserId,
        row.platform,
        row.ign
      ]
    );
    const peer = peerResult.rows[0];
    if (!peer) {
      await client.query("commit");
      return { linked: false, identityGroupId: row.identityGroupId ?? null };
    }

    if (row.identityGroupId && peer.identityGroupId && row.identityGroupId !== peer.identityGroupId) {
      await client.query("commit");
      return { linked: false, identityGroupId: row.identityGroupId };
    }

    const groupId = row.identityGroupId ?? peer.identityGroupId ?? null;
    const resolvedGroupId =
      groupId ??
      (
        await client.query<{ id: string }>("select gen_random_uuid()::text as id")
      ).rows[0].id;

    await client.query(
      `
      update tracked_accounts
      set identity_group_id = $2,
          updated_at = now()
      where id = $1
      `,
      [row.id, resolvedGroupId]
    );
    await client.query(
      `
      update tracked_accounts
      set identity_group_id = $2,
          updated_at = now()
      where id = $1
      `,
      [peer.id, resolvedGroupId]
    );
    await client.query(
      `
      insert into identity_link_events
        (guild_id, actor_user_id, event_type, tracked_account_id, peer_tracked_account_id, old_group_id, new_group_id, reason)
      values
        ($1, $2, 'auto_link', $3, $4, $5, $6, $7)
      `,
      [
        row.guildId,
        params.actorUserId,
        row.id,
        peer.id,
        row.identityGroupId,
        resolvedGroupId,
        "exact_owner_name_platform"
      ]
    );

    await client.query("commit");
    return { linked: true, identityGroupId: resolvedGroupId };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function linkTrackedAccounts(params: {
  guildId: string;
  actorUserId: string;
  sourceTrackedAccountId: string;
  targetTrackedAccountId: string;
  reason: string;
}): Promise<{ identityGroupId: string }> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const rows = await client.query<{ id: string; identityGroupId: string | null }>(
      `
      select id, identity_group_id as "identityGroupId"
      from tracked_accounts
      where guild_id = $1 and id = any($2::uuid[])
      for update
      `,
      [params.guildId, [params.sourceTrackedAccountId, params.targetTrackedAccountId]]
    );
    if (rows.rowCount !== 2) {
      throw new AppError("Tracked accounts not found for linking.", 404, "NOT_FOUND");
    }
    const source = rows.rows.find((r) => r.id === params.sourceTrackedAccountId)!;
    const target = rows.rows.find((r) => r.id === params.targetTrackedAccountId)!;
    const resolvedGroupId =
      target.identityGroupId ??
      source.identityGroupId ??
      (await client.query<{ id: string }>("select gen_random_uuid()::text as id")).rows[0].id;

    await client.query(
      `
      update tracked_accounts
      set identity_group_id = $2, updated_at = now()
      where id = any($1::uuid[])
      `,
      [[params.sourceTrackedAccountId, params.targetTrackedAccountId], resolvedGroupId]
    );
    await client.query(
      `
      insert into identity_link_events
        (guild_id, actor_user_id, event_type, tracked_account_id, peer_tracked_account_id, old_group_id, new_group_id, reason)
      values
        ($1, $2, 'manual_link', $3, $4, $5, $6, $7)
      `,
      [
        params.guildId,
        params.actorUserId,
        params.sourceTrackedAccountId,
        params.targetTrackedAccountId,
        source.identityGroupId,
        resolvedGroupId,
        params.reason
      ]
    );
    await client.query("commit");
    return { identityGroupId: resolvedGroupId };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function unlinkTrackedAccount(params: {
  guildId: string;
  actorUserId: string;
  trackedAccountId: string;
  reason: string;
}): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const existing = await client.query<{ identityGroupId: string | null }>(
      `
      select identity_group_id as "identityGroupId"
      from tracked_accounts
      where guild_id = $1 and id = $2
      for update
      `,
      [params.guildId, params.trackedAccountId]
    );
    if ((existing.rowCount ?? 0) === 0) {
      throw new AppError("Tracked account not found.", 404, "NOT_FOUND");
    }
    const oldGroupId = existing.rows[0].identityGroupId;
    await client.query(
      `
      update tracked_accounts
      set identity_group_id = null, updated_at = now()
      where guild_id = $1 and id = $2
      `,
      [params.guildId, params.trackedAccountId]
    );
    await client.query(
      `
      insert into identity_link_events
        (guild_id, actor_user_id, event_type, tracked_account_id, old_group_id, new_group_id, reason)
      values
        ($1, $2, 'manual_unlink', $3, $4, null, $5)
      `,
      [params.guildId, params.actorUserId, params.trackedAccountId, oldGroupId, params.reason]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function claimNextDueTrackedAccount(params: {
  pollMinutes: number;
  onlinePollSeconds?: number;
  leaseSeconds: number;
  workerId: string;
  guildId?: string;
}): Promise<TTrackedAccount | null> {
  const pollMinutes = Math.max(1, Math.trunc(params.pollMinutes));
  const onlinePollSeconds = Math.max(15, Math.trunc(params.onlinePollSeconds ?? pollMinutes * 60));
  const leaseSeconds = Math.max(30, Math.trunc(params.leaseSeconds));
  const withGuildFilter = typeof params.guildId === "string" && params.guildId.length > 0;

  const result = await pool.query<TTrackedAccount>(
    `
    with candidate as (
      select id
      from tracked_accounts
      where is_active = true
        and (ingest_claimed_until is null or ingest_claimed_until < now())
        and (
          last_checked_at is null
          or (
            case
              when coalesce(realtime_is_in_game, 0) = 1 or coalesce(realtime_is_online, 0) = 1
                then last_checked_at <= now() - ($2::int * interval '1 second')
              else last_checked_at <= now() - ($1::int * interval '1 minute')
            end
          )
        )
        and ($3::text is null or guild_id = $3)
      order by coalesce(last_checked_at, to_timestamp(0)) asc
      for update skip locked
      limit 1
    )
    update tracked_accounts ta
    set
      ingest_claimed_until = now() + ($4::int * interval '1 second'),
      ingest_claimed_by = $5,
      updated_at = now()
    from candidate
    where ta.id = candidate.id
    returning ${ACCOUNT_FIELDS_TA}
    `,
    [pollMinutes, onlinePollSeconds, withGuildFilter ? params.guildId : null, leaseSeconds, params.workerId]
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
  dueOnlineCount: number;
  dueOfflineCount: number;
  claimedCount: number;
}> {
  const withGuildFilter = typeof guildId === "string" && guildId.length > 0;
  const pollMinutes = Number(process.env.INGEST_POLL_MINUTES ?? 5);
  const onlinePollSeconds = Number(process.env.INGEST_POLL_SECONDS_ONLINE ?? 30);
  const result = await pool.query<{
    activeCount: string;
    dueCount: string;
    dueOnlineCount: string;
    dueOfflineCount: string;
    claimedCount: string;
  }>(
    `
    select
      count(*) filter (where is_active = true)::text as "activeCount",
      count(*) filter (
        where is_active = true
          and (ingest_claimed_until is null or ingest_claimed_until < now())
          and (
            last_checked_at is null
            or (
              (coalesce(realtime_is_in_game, 0) = 1 or coalesce(realtime_is_online, 0) = 1)
              and last_checked_at <= now() - ($3::int * interval '1 second')
            )
            or (
              coalesce(realtime_is_in_game, 0) <> 1
              and coalesce(realtime_is_online, 0) <> 1
              and last_checked_at <= now() - ($2::int * interval '1 minute')
            )
          )
      )::text as "dueCount",
      count(*) filter (
        where is_active = true
          and (coalesce(realtime_is_in_game, 0) = 1 or coalesce(realtime_is_online, 0) = 1)
          and (ingest_claimed_until is null or ingest_claimed_until < now())
          and (last_checked_at is null or last_checked_at <= now() - ($3::int * interval '1 second'))
      )::text as "dueOnlineCount",
      count(*) filter (
        where is_active = true
          and coalesce(realtime_is_in_game, 0) <> 1
          and coalesce(realtime_is_online, 0) <> 1
          and (ingest_claimed_until is null or ingest_claimed_until < now())
          and (last_checked_at is null or last_checked_at <= now() - ($2::int * interval '1 minute'))
      )::text as "dueOfflineCount",
      count(*) filter (
        where is_active = true
          and ingest_claimed_until is not null
          and ingest_claimed_until >= now()
      )::text as "claimedCount"
    from tracked_accounts
    where ($1::text is null or guild_id = $1)
    `,
    [
      withGuildFilter ? guildId : null,
      Math.max(1, Math.trunc(pollMinutes)),
      Math.max(15, Math.trunc(onlinePollSeconds))
    ]
  );

  return {
    activeCount: Number(result.rows[0]?.activeCount ?? 0),
    dueCount: Number(result.rows[0]?.dueCount ?? 0),
    dueOnlineCount: Number(result.rows[0]?.dueOnlineCount ?? 0),
    dueOfflineCount: Number(result.rows[0]?.dueOfflineCount ?? 0),
    claimedCount: Number(result.rows[0]?.claimedCount ?? 0)
  };
}
