import { type TMatch } from "@apex-assistant/core";
import { pool } from "../client.js";

type TMatchInsert = {
  trackedAccountId: string;
  providerMatchId: string;
  playedAt: Date;
  mode: string | null;
  placement: number | null;
  kills: number | null;
  assists: number | null;
  knocks: number | null;
  damage: number | null;
  survivalTimeSec: number | null;
  rawPayload: Record<string, unknown>;
};

export async function upsertMatch(input: TMatchInsert): Promise<TMatch> {
  const result = await pool.query<TMatch>(
    `
    insert into matches (
      tracked_account_id,
      provider_match_id,
      played_at,
      mode,
      placement,
      kills,
      assists,
      knocks,
      damage,
      survival_time_sec,
      raw_payload
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
    on conflict (tracked_account_id, provider, provider_match_id)
    do update set
      played_at = excluded.played_at,
      mode = excluded.mode,
      placement = excluded.placement,
      kills = excluded.kills,
      assists = excluded.assists,
      knocks = excluded.knocks,
      damage = excluded.damage,
      survival_time_sec = excluded.survival_time_sec,
      raw_payload = excluded.raw_payload
    returning
      id,
      tracked_account_id as "trackedAccountId",
      provider,
      provider_match_id as "providerMatchId",
      played_at as "playedAt",
      mode,
      placement,
      kills,
      assists,
      knocks,
      damage,
      survival_time_sec as "survivalTimeSec",
      raw_payload as "rawPayload"
    `,
    [
      input.trackedAccountId,
      input.providerMatchId,
      input.playedAt,
      input.mode,
      input.placement,
      input.kills,
      input.assists,
      input.knocks,
      input.damage,
      input.survivalTimeSec,
      JSON.stringify(input.rawPayload)
    ]
  );
  return result.rows[0];
}

export async function getMatchesByPlayer(params: {
  guildId: string;
  ign: string;
  platform: string;
  limit?: number;
}): Promise<TMatch[]> {
  const result = await pool.query<TMatch>(
    `
    select
      m.id,
      m.tracked_account_id as "trackedAccountId",
      m.provider,
      m.provider_match_id as "providerMatchId",
      m.played_at as "playedAt",
      m.mode,
      m.placement,
      m.kills,
      m.assists,
      m.knocks,
      m.damage,
      m.survival_time_sec as "survivalTimeSec",
      m.raw_payload as "rawPayload"
    from matches m
    join tracked_accounts ta on ta.id = m.tracked_account_id
    where ta.guild_id = $1 and ta.ign = $2 and ta.platform = $3
    order by m.played_at desc
    limit $4
    `,
    [params.guildId, params.ign, params.platform, params.limit ?? 25]
  );
  return result.rows;
}
