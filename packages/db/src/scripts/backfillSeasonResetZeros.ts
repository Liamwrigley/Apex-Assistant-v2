import dotenv from "dotenv";
import { resolve } from "node:path";
import { pool } from "../client.js";

/**
 * One-off script to fix data poisoned by the season reset.
 *
 * When a season resets, the API reports 0 RP for all players until they log in.
 * This creates:
 *   - rank_snapshots with rank_score = 0
 *   - inferred_game_segments with opening/closing_rank_score = 0 and bogus rp_delta
 *   - play_sessions with opening/latest_rank_score = 0
 *
 * This script finds accounts that have 0-RP snapshots followed by a real rank,
 * and patches the 0-RP rows with the first real rank value observed after.
 *
 * Usage (from repo root, DATABASE_URL in .env):
 *   npx tsx packages/db/src/scripts/backfillSeasonResetZeros.ts
 *   npx tsx packages/db/src/scripts/backfillSeasonResetZeros.ts --dry-run
 */

const DRY_RUN = process.argv.includes("--dry-run");
const LOOKBACK_HOURS = 72;

function requireDatabaseUrl(): void {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing. Ensure apex-assistant/.env exists.");
  }
}

async function run(): Promise<void> {
  dotenv.config({ path: resolve(process.cwd(), "../../.env") });
  requireDatabaseUrl();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Find accounts that had 0-RP snapshots and then a real rank afterwards.
    // For each, determine the "recovery rank" = first non-zero rank after the 0-RP period.
    const accountsRes = await client.query<{
      trackedAccountId: string;
      recoveryRank: number;
      zeroCount: number;
    }>(`
      WITH zero_snaps AS (
        SELECT tracked_account_id, max(captured_at) AS last_zero_at
        FROM rank_snapshots
        WHERE rank_score = 0
          AND captured_at >= now() - ($1::int * interval '1 hour')
        GROUP BY tracked_account_id
      ),
      recovery AS (
        SELECT DISTINCT ON (zs.tracked_account_id)
          zs.tracked_account_id,
          rs.rank_score AS recovery_rank
        FROM zero_snaps zs
        JOIN rank_snapshots rs
          ON rs.tracked_account_id = zs.tracked_account_id
          AND rs.rank_score > 0
          AND rs.captured_at > zs.last_zero_at
        ORDER BY zs.tracked_account_id, rs.captured_at ASC
      )
      SELECT
        r.tracked_account_id AS "trackedAccountId",
        r.recovery_rank AS "recoveryRank",
        (SELECT count(*)::int FROM rank_snapshots
         WHERE tracked_account_id = r.tracked_account_id
           AND rank_score = 0
           AND captured_at >= now() - ($1::int * interval '1 hour')
        ) AS "zeroCount"
      FROM recovery r
      WHERE r.recovery_rank > 1000
    `, [LOOKBACK_HOURS]);

    if (accountsRes.rows.length === 0) {
      console.log("[backfill] No accounts found with 0-RP season reset data.");
      await client.query("ROLLBACK");
      return;
    }

    console.log(`[backfill] Found ${accountsRes.rows.length} account(s) with season reset 0-RP data:`);
    for (const row of accountsRes.rows) {
      console.log(`  account=${row.trackedAccountId} recovery_rank=${row.recoveryRank} zero_snapshots=${row.zeroCount}`);
    }

    let totalSnapshots = 0;
    let totalSegments = 0;
    let totalSessions = 0;

    for (const account of accountsRes.rows) {
      const { trackedAccountId, recoveryRank } = account;

      const snapRes = await client.query(
        `UPDATE rank_snapshots
         SET rank_score = $2
         WHERE tracked_account_id = $1
           AND rank_score = 0
           AND captured_at >= now() - ($3::int * interval '1 hour')`,
        [trackedAccountId, recoveryRank, LOOKBACK_HOURS]
      );
      totalSnapshots += snapRes.rowCount ?? 0;

      const segRes = await client.query(
        `UPDATE inferred_game_segments
         SET
           opening_rank_score = CASE WHEN opening_rank_score = 0 THEN $2 ELSE opening_rank_score END,
           closing_rank_score = CASE WHEN closing_rank_score = 0 THEN $2 ELSE closing_rank_score END,
           rp_delta = NULL
         WHERE tracked_account_id = $1
           AND (opening_rank_score = 0 OR closing_rank_score = 0)
           AND started_at >= now() - ($3::int * interval '1 hour')`,
        [trackedAccountId, recoveryRank, LOOKBACK_HOURS]
      );
      totalSegments += segRes.rowCount ?? 0;

      const sessRes = await client.query(
        `UPDATE play_sessions
         SET
           opening_rank_score = CASE WHEN opening_rank_score = 0 THEN $2 ELSE opening_rank_score END,
           latest_rank_score = CASE WHEN latest_rank_score = 0 THEN $2 ELSE latest_rank_score END
         WHERE tracked_account_id = $1
           AND (opening_rank_score = 0 OR latest_rank_score = 0)
           AND started_at >= now() - ($3::int * interval '1 hour')`,
        [trackedAccountId, recoveryRank, LOOKBACK_HOURS]
      );
      totalSessions += sessRes.rowCount ?? 0;
    }

    console.log(`[backfill] Results: snapshots=${totalSnapshots} segments=${totalSegments} sessions=${totalSessions}`);

    if (DRY_RUN) {
      console.log("[backfill] DRY RUN — rolling back.");
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
      console.log("[backfill] Committed.");
    }
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("[backfill] Fatal error:", err);
  process.exit(1);
});
