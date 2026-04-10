import { pool } from "../client.js";

export type TVoiceInterval = {
  id: string;
  guildId: string;
  discordUserId: string;
  channelId: string;
  joinedAt: Date;
  leftAt: Date | null;
  createdAt: Date;
};

const FIELDS = `
  id,
  guild_id as "guildId",
  discord_user_id as "discordUserId",
  channel_id as "channelId",
  joined_at as "joinedAt",
  left_at as "leftAt",
  created_at as "createdAt"
`;

/**
 * Open a new voice interval (user joined a voice channel).
 * Closes any stale open interval for that user+guild first (crash recovery).
 */
export async function openVoiceInterval(input: {
  guildId: string;
  discordUserId: string;
  channelId: string;
}): Promise<TVoiceInterval> {
  await pool.query(
    `update discord_voice_intervals
     set left_at = now()
     where guild_id = $1
       and discord_user_id = $2
       and left_at is null`,
    [input.guildId, input.discordUserId],
  );

  const result = await pool.query<TVoiceInterval>(
    `insert into discord_voice_intervals (guild_id, discord_user_id, channel_id)
     values ($1, $2, $3)
     returning ${FIELDS}`,
    [input.guildId, input.discordUserId, input.channelId],
  );
  return result.rows[0];
}

/** Close the currently open voice interval for a user in a guild. */
export async function closeVoiceInterval(
  guildId: string,
  discordUserId: string,
): Promise<void> {
  await pool.query(
    `update discord_voice_intervals
     set left_at = now()
     where guild_id = $1
       and discord_user_id = $2
       and left_at is null`,
    [guildId, discordUserId],
  );
}

/**
 * Find voice intervals overlapping a time window for a specific guild + channel.
 * Used by the party correlation job to find who shared VC during a segment.
 */
export async function getOverlappingVoiceIntervals(
  guildId: string,
  channelId: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<TVoiceInterval[]> {
  const result = await pool.query<TVoiceInterval>(
    `select ${FIELDS}
     from discord_voice_intervals
     where guild_id = $1
       and channel_id = $2
       and joined_at < $4
       and (left_at is null or left_at > $3)
     order by joined_at asc`,
    [guildId, channelId, windowStart, windowEnd],
  );
  return result.rows;
}

/**
 * All voice intervals for a Discord user overlapping a time window.
 * Returns which channels they were in during that period.
 */
export async function getVoiceIntervalsForUser(
  guildId: string,
  discordUserId: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<TVoiceInterval[]> {
  const result = await pool.query<TVoiceInterval>(
    `select ${FIELDS}
     from discord_voice_intervals
     where guild_id = $1
       and discord_user_id = $2
       and joined_at < $4
       and (left_at is null or left_at > $3)
     order by joined_at asc`,
    [guildId, discordUserId, windowStart, windowEnd],
  );
  return result.rows;
}

/** Recent voice intervals for a guild (debug / dashboard). */
export async function getRecentVoiceIntervals(
  guildId: string,
  limit = 100,
): Promise<TVoiceInterval[]> {
  const result = await pool.query<TVoiceInterval>(
    `select ${FIELDS}
     from discord_voice_intervals
     where guild_id = $1
     order by joined_at desc
     limit $2`,
    [guildId, limit],
  );
  return result.rows;
}
