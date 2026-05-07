import { Redis } from "@upstash/redis";

let redisInstance: Redis | null = null;

function getRedis(): Redis | null {
  if (redisInstance) return redisInstance;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redisInstance = new Redis({ url, token });
  return redisInstance;
}

/**
 * Cache-aside read: returns the cached value if present, otherwise calls
 * `computeFn`, stores the result, and returns it. If Redis is unavailable
 * or not configured, falls through to `computeFn` transparently.
 */
export async function cacheRead<T>(
  key: string,
  computeFn: () => Promise<T>,
): Promise<T> {
  const redis = getRedis();
  if (redis) {
    try {
      const cached = await redis.get<T>(key);
      if (cached !== null && cached !== undefined) return cached;
    } catch {
      // Redis down — fall through to compute
    }
  }
  const result = await computeFn();
  if (redis) {
    try {
      await redis.set(key, result);
    } catch {
      // best-effort
    }
  }
  return result;
}

/**
 * Deletes one or more cache keys. Called by the worker after meaningful
 * data changes so the next reader recomputes from Postgres.
 */
export async function cacheInvalidate(...keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(...keys);
  } catch {
    // best-effort
  }
}

/** Single source of truth for all cache key shapes. */
export const CacheKeys = {
  dashboardLive: (guildId?: string) => `dashboard-live:${guildId ?? "all"}`,
  dashboardStatic: (guildId?: string) => `dashboard-static:${guildId ?? "all"}`,
  leaderboard: (guildId?: string) => `leaderboard:${guildId ?? "all"}`,
  lbTimelines: (guildId?: string, hours = 168) =>
    `lb-timelines:${guildId ?? "all"}:${hours}`,
  stats24h: (guildId?: string) => `stats-24h:${guildId ?? "all"}`,
  tracked: (guildId?: string) => `tracked:${guildId ?? "all"}`,
  playerPage: (id: string) => `player-page:${id}`,
  profileRange: (id: string, range: string) => `profile-range:${id}:${range}`,
  playerTimeline: (id: string, hours: number) =>
    `player-timeline:${id}:${hours}`,
  stackMates: (id: string) => `stack-mates:${id}`,
  stackBreakdown: (id: string, mateIds: string) =>
    `stack-breakdown:${id}:${mateIds}`,
  health: () => "health",
} as const;

/** All range keys used by the profile-range API. */
export const ALL_PROFILE_RANGES = ["24h", "3d", "7d", "14d", "30d"] as const;

/** All hour values corresponding to the profile ranges. */
export const ALL_TIMELINE_HOURS = [24, 72, 168, 336, 720] as const;

/**
 * Returns every cache key that should be invalidated when a specific
 * tracked account's data changes meaningfully (rank, session, presence).
 */
export function playerInvalidationKeys(accountId: string): string[] {
  const keys: string[] = [CacheKeys.playerPage(accountId)];
  for (const range of ALL_PROFILE_RANGES) {
    keys.push(CacheKeys.profileRange(accountId, range));
  }
  for (const hours of ALL_TIMELINE_HOURS) {
    keys.push(CacheKeys.playerTimeline(accountId, hours));
  }
  keys.push(CacheKeys.stackMates(accountId));
  return keys;
}
