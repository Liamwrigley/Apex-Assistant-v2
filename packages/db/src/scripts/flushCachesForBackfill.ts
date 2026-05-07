import dotenv from "dotenv";
import { resolve } from "node:path";
import { pool } from "../client.js";
import { Redis } from "@upstash/redis";

/**
 * Flushes Redis caches for accounts affected by the season reset backfill.
 * Run after the backfill script to ensure stale cached data is cleared.
 */

const AFFECTED_ACCOUNT_IDS = [
  "6d2e88e0-6ade-4447-b060-fd8b97b8c075",
  "a981cf82-6b5e-4ff2-b899-45c60ce275ba",
  "b9b07973-3288-41ae-8899-c88fb9b52c4f",
];

const ALL_PROFILE_RANGES = ["24h", "3d", "7d", "14d", "30d"];
const ALL_TIMELINE_HOURS = [24, 72, 168, 336, 720];

async function run(): Promise<void> {
  dotenv.config({ path: resolve(process.cwd(), "../../.env") });

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!redisUrl || !redisToken) {
    console.error("UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set.");
    process.exit(1);
  }

  const redis = new Redis({ url: redisUrl, token: redisToken });

  const res = await pool.query<{ id: string; guildId: string }>(
    `SELECT id, guild_id AS "guildId" FROM tracked_accounts WHERE id = ANY($1::uuid[])`,
    [AFFECTED_ACCOUNT_IDS]
  );

  const keys: string[] = [];
  const guildIds = new Set<string>();

  for (const row of res.rows) {
    guildIds.add(row.guildId);

    keys.push(`player-page:${row.id}`);
    for (const range of ALL_PROFILE_RANGES) {
      keys.push(`profile-range:${row.id}:${range}`);
    }
    for (const hours of ALL_TIMELINE_HOURS) {
      keys.push(`player-timeline:${row.id}:${hours}`);
    }
    keys.push(`stack-mates:${row.id}`);
  }

  for (const gid of guildIds) {
    for (const scope of [gid, "all"]) {
      keys.push(`dashboard-live:${scope}`);
      keys.push(`dashboard-static:${scope}`);
      keys.push(`leaderboard:${scope}`);
      keys.push(`lb-timelines:${scope}:168`);
      keys.push(`stats-24h:${scope}`);
      keys.push(`tracked:${scope}`);
    }
  }

  console.log(`[cache-flush] Invalidating ${keys.length} cache keys for ${res.rows.length} accounts...`);

  if (keys.length > 0) {
    await redis.del(...keys);
  }

  console.log("[cache-flush] Done.");
  await pool.end();
}

run().catch((err) => {
  console.error("[cache-flush] Fatal error:", err);
  process.exit(1);
});
