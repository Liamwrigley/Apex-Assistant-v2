import { pool } from "../client.js";

export async function getLatestIngestionRunByGuild(guildId: string): Promise<{
  provider: string;
  runType: string;
  startedAt: Date;
  finishedAt: Date | null;
  success: boolean;
  processedItems: number;
  errorMessage: string | null;
} | null> {
  const result = await pool.query<{
    provider: string;
    runType: string;
    startedAt: Date;
    finishedAt: Date | null;
    success: boolean;
    processedItems: number;
    errorMessage: string | null;
  }>(
    `
    select
      provider,
      run_type as "runType",
      started_at as "startedAt",
      finished_at as "finishedAt",
      success,
      processed_items as "processedItems",
      error_message as "errorMessage"
    from ingestion_runs
    where guild_id = $1
    order by started_at desc
    limit 1
    `,
    [guildId]
  );
  return result.rows[0] ?? null;
}

export async function getLatestIngestionRun(guildId?: string): Promise<{
  provider: string;
  runType: string;
  guildId: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  success: boolean;
  processedItems: number;
  errorMessage: string | null;
} | null> {
  const withGuildFilter = typeof guildId === "string" && guildId.length > 0;
  const result = await pool.query<{
    provider: string;
    runType: string;
    guildId: string | null;
    startedAt: Date;
    finishedAt: Date | null;
    success: boolean;
    processedItems: number;
    errorMessage: string | null;
  }>(
    `
    select
      provider,
      run_type as "runType",
      guild_id as "guildId",
      started_at as "startedAt",
      finished_at as "finishedAt",
      success,
      processed_items as "processedItems",
      error_message as "errorMessage"
    from ingestion_runs
    where ($1::text is null or guild_id = $1)
    order by started_at desc
    limit 1
    `,
    [withGuildFilter ? guildId : null]
  );
  return result.rows[0] ?? null;
}

export async function getLatestTrackedSyncAt(guildId?: string): Promise<Date | null> {
  const withGuildFilter = typeof guildId === "string" && guildId.length > 0;
  const result = await pool.query<{ latestSyncAt: Date | null }>(
    `
    select max(last_checked_at) as "latestSyncAt"
    from tracked_accounts
    where is_active = true
      and last_checked_at is not null
      and ($1::text is null or guild_id = $1)
    `,
    [withGuildFilter ? guildId : null]
  );
  return result.rows[0]?.latestSyncAt ?? null;
}
