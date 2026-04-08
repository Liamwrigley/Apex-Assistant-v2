import { pool } from "../client.js";

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
