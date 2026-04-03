import dotenv from "dotenv";
import { resolve } from "node:path";
import { pool } from "../client.js";

/**
 * Fills play_sessions.opening_* / latest_* from rank_snapshots when those columns are NULL.
 *
 * - Opening: snapshot for the same tracked account closest in time to started_at.
 * - Latest (ended): closest in time to ended_at.
 * - Latest (open): most recent snapshot for the account.
 *
 * Only NULL fields are set (COALESCE). Existing values are kept.
 *
 * UPDATE ... FROM LATERAL cannot reference the table being updated in PostgreSQL, so each
 * UPDATE joins through a subquery that aliases play_sessions as `s` and runs LATERAL there.
 *
 * Usage (from repo root, DATABASE_URL in .env):
 *   npm run backfill:session-ranks -w @apex-assistant/db
 *   npm run backfill:session-ranks -w @apex-assistant/db -- --dry-run
 */

const DRY_RUN = process.argv.includes("--dry-run");

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

    const openingWhereS = `
      (
        s.opening_rank_score is null
        or s.opening_rank_name is null
        or s.opening_rank_icon_url is null
      )
    `;

    const latestWhereS = `
      (
        s.latest_rank_score is null
        or s.latest_rank_name is null
        or s.latest_rank_icon_url is null
      )
    `;

    const openingWherePs = `
      (
        ps.opening_rank_score is null
        or ps.opening_rank_name is null
        or ps.opening_rank_icon_url is null
      )
    `;

    const latestWherePs = `
      (
        ps.latest_rank_score is null
        or ps.latest_rank_name is null
        or ps.latest_rank_icon_url is null
      )
    `;

    if (DRY_RUN) {
      const o = await client.query<{ n: string }>(
        `
        select count(*)::text as n
        from play_sessions ps
        inner join lateral (
          select rs.rank_score, rs.rank_name, rs.rank_division, rs.icon_url
          from rank_snapshots rs
          where rs.tracked_account_id = ps.tracked_account_id
          order by abs(extract(epoch from (rs.captured_at - ps.started_at)))
          limit 1
        ) snap on true
        where ${openingWherePs}
        `
      );
      const lc = await client.query<{ n: string }>(
        `
        select count(*)::text as n
        from play_sessions ps
        inner join lateral (
          select rs.rank_score, rs.rank_name, rs.rank_division, rs.icon_url
          from rank_snapshots rs
          where rs.tracked_account_id = ps.tracked_account_id
          order by abs(extract(epoch from (rs.captured_at - ps.ended_at)))
          limit 1
        ) snap on true
        where ps.ended_at is not null
          and ${latestWherePs}
        `
      );
      const lo = await client.query<{ n: string }>(
        `
        select count(*)::text as n
        from play_sessions ps
        inner join lateral (
          select rs.rank_score, rs.rank_name, rs.rank_division, rs.icon_url
          from rank_snapshots rs
          where rs.tracked_account_id = ps.tracked_account_id
          order by rs.captured_at desc
          limit 1
        ) snap on true
        where ps.ended_at is null
          and ${latestWherePs}
        `
      );
      console.log("[dry-run] sessions that would get opening_* from snapshots:", o.rows[0]?.n ?? "0");
      console.log("[dry-run] closed sessions that would get latest_* from snapshots:", lc.rows[0]?.n ?? "0");
      console.log("[dry-run] open sessions that would get latest_* from snapshots:", lo.rows[0]?.n ?? "0");
      await client.query("ROLLBACK");
      return;
    }

    const openingRes = await client.query(
      `
      update play_sessions ps
      set
        opening_rank_score = coalesce(ps.opening_rank_score, src.rank_score),
        opening_rank_name = coalesce(ps.opening_rank_name, src.rank_name),
        opening_rank_division = coalesce(ps.opening_rank_division, src.rank_division),
        opening_rank_icon_url = coalesce(ps.opening_rank_icon_url, src.icon_url)
      from (
        select
          s.id as session_id,
          snap.rank_score,
          snap.rank_name,
          snap.rank_division,
          snap.icon_url
        from play_sessions s
        inner join lateral (
          select rs.rank_score, rs.rank_name, rs.rank_division, rs.icon_url
          from rank_snapshots rs
          where rs.tracked_account_id = s.tracked_account_id
          order by abs(extract(epoch from (rs.captured_at - s.started_at)))
          limit 1
        ) snap on true
        where ${openingWhereS}
      ) src
      where ps.id = src.session_id
      `
    );

    const latestClosedRes = await client.query(
      `
      update play_sessions ps
      set
        latest_rank_score = coalesce(ps.latest_rank_score, src.rank_score),
        latest_rank_name = coalesce(ps.latest_rank_name, src.rank_name),
        latest_rank_division = coalesce(ps.latest_rank_division, src.rank_division),
        latest_rank_icon_url = coalesce(ps.latest_rank_icon_url, src.icon_url)
      from (
        select
          s.id as session_id,
          snap.rank_score,
          snap.rank_name,
          snap.rank_division,
          snap.icon_url
        from play_sessions s
        inner join lateral (
          select rs.rank_score, rs.rank_name, rs.rank_division, rs.icon_url
          from rank_snapshots rs
          where rs.tracked_account_id = s.tracked_account_id
          order by abs(extract(epoch from (rs.captured_at - s.ended_at)))
          limit 1
        ) snap on true
        where s.ended_at is not null
          and ${latestWhereS}
      ) src
      where ps.id = src.session_id
      `
    );

    const latestOpenRes = await client.query(
      `
      update play_sessions ps
      set
        latest_rank_score = coalesce(ps.latest_rank_score, src.rank_score),
        latest_rank_name = coalesce(ps.latest_rank_name, src.rank_name),
        latest_rank_division = coalesce(ps.latest_rank_division, src.rank_division),
        latest_rank_icon_url = coalesce(ps.latest_rank_icon_url, src.icon_url)
      from (
        select
          s.id as session_id,
          snap.rank_score,
          snap.rank_name,
          snap.rank_division,
          snap.icon_url
        from play_sessions s
        inner join lateral (
          select rs.rank_score, rs.rank_name, rs.rank_division, rs.icon_url
          from rank_snapshots rs
          where rs.tracked_account_id = s.tracked_account_id
          order by rs.captured_at desc
          limit 1
        ) snap on true
        where s.ended_at is null
          and ${latestWhereS}
      ) src
      where ps.id = src.session_id
      `
    );

    await client.query("COMMIT");

    console.log("Backfill complete.");
    console.log("  opening_* rows updated:", openingRes.rowCount ?? 0);
    console.log("  latest_* (closed) rows updated:", latestClosedRes.rowCount ?? 0);
    console.log("  latest_* (open) rows updated:", latestOpenRes.rowCount ?? 0);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error: unknown) => {
  console.error("backfillPlaySessionRanksFromSnapshots failed:", error);
  process.exit(1);
});
