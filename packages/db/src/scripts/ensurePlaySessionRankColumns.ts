import dotenv from "dotenv";
import { resolve } from "node:path";
import { pool } from "../client.js";

/**
 * Adds play_sessions rank metadata columns if missing (idempotent).
 * Run when you see: column "opening_rank_name" does not exist
 *
 *   npm run ensure:play-session-rank-cols -w @apex-assistant/db
 *
 * Or apply full schema:
 *
 *   npm run migrate -w @apex-assistant/db
 */

const ALTERS = [
  "alter table play_sessions add column if not exists opening_rank_name text",
  "alter table play_sessions add column if not exists opening_rank_division text",
  "alter table play_sessions add column if not exists opening_rank_icon_url text",
  "alter table play_sessions add column if not exists latest_rank_name text",
  "alter table play_sessions add column if not exists latest_rank_division text",
  "alter table play_sessions add column if not exists latest_rank_icon_url text",
];

async function run(): Promise<void> {
  dotenv.config({ path: resolve(process.cwd(), "../../.env") });
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing. Ensure apex-assistant/.env exists.");
  }
  for (const sql of ALTERS) {
    await pool.query(sql);
  }
  await pool.end();
  console.log("play_sessions rank metadata columns ensured.");
}

run().catch((error: unknown) => {
  console.error("ensurePlaySessionRankColumns failed:", error);
  process.exit(1);
});
