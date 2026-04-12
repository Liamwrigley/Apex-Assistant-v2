/**
 * Read-only digest of party / voice data for local debugging.
 * Run from repo: npm run digest:party -w @apex-assistant/db
 * (cwd must be packages/db so ../../.env resolves.)
 */
import dotenv from "dotenv";
import { resolve } from "node:path";
import { pool } from "../client.js";

dotenv.config({ path: resolve(process.cwd(), "../../.env") });

async function run(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing. Run from packages/db with apex-assistant/.env present.");
  }

  console.log("=== Party / voice digest (read-only) ===\n");

  const viByGuild = await pool.query<{ guild_id: string; n: string }>(
    `select guild_id, count(*)::text as n
     from discord_voice_intervals
     group by guild_id
     order by count(*) desc`,
  );
  const viTotal = await pool.query<{ n: string }>(
    `select count(*)::text as n from discord_voice_intervals`,
  );
  console.log(`Voice intervals — total: ${viTotal.rows[0]?.n ?? "0"}`);
  console.log("  By guild_id:");
  for (const r of viByGuild.rows) {
    console.log(`    ${r.guild_id}  →  ${r.n} rows`);
  }
  if (viByGuild.rows.length === 0) {
    console.log("    (none)");
  }

  const viRecent = await pool.query(
    `select guild_id, discord_user_id, channel_id, joined_at, left_at
     from discord_voice_intervals
     order by joined_at desc
     limit 12`,
  );
  console.log("\nVoice intervals — 12 most recent (joined_at desc):");
  for (const r of viRecent.rows) {
    const row = r as Record<string, unknown>;
    const left = row.left_at ? String(row.left_at) : "(open)";
    console.log(
      `  ${String(row.joined_at)}  guild=${row.guild_id}  user=${row.discord_user_id}  ch=${row.channel_id}  left=${left}`,
    );
  }
  if (viRecent.rows.length === 0) {
    console.log("  (none)");
  }

  const edgeTotal = await pool.query<{ n: string }>(
    `select count(*)::text as n from party_segment_edges`,
  );
  console.log(`\nParty segment edges — total: ${edgeTotal.rows[0]?.n ?? "0"}`);

  const edgesRecent = await pool.query(
    `select e.id, e.score, e.created_at,
            ta_a.ign as ign_a, ta_b.ign as ign_b,
            seg_a.legend_assumed as legend_a, seg_b.legend_assumed as legend_b,
            seg_a.rp_delta as rp_a, seg_b.rp_delta as rp_b,
            e.evidence
     from party_segment_edges e
     join inferred_game_segments seg_a on seg_a.id = e.segment_id_a
     join inferred_game_segments seg_b on seg_b.id = e.segment_id_b
     join tracked_accounts ta_a on ta_a.id = e.tracked_account_id_a
     join tracked_accounts ta_b on ta_b.id = e.tracked_account_id_b
     order by e.created_at desc
     limit 15`,
  );
  console.log("\nParty edges — 15 most recent:");
  for (const r of edgesRecent.rows) {
    const row = r as Record<string, unknown>;
    const ev = row.evidence as Record<string, unknown> | null;
    const vc = typeof ev?.vcOverlapSec === "number" ? `${ev.vcOverlapSec}s` : "—";
    const ch = typeof ev?.channelId === "string" ? ev.channelId : "—";
    console.log(
      `  score=${Number(row.score).toFixed(3)}  ${String(row.ign_a)} vs ${String(row.ign_b)}  legends=${row.legend_a ?? "?"}/${row.legend_b ?? "?"}  RP=${row.rp_a ?? "?"}/${row.rp_b ?? "?"}  VC~${vc}  ch=${ch}  at=${String(row.created_at)}`,
    );
  }
  if (edgesRecent.rows.length === 0) {
    console.log("  (none — correlation may not have produced edges yet, or filters excluded segments)");
  }

  const segClosed = await pool.query<{ n: string }>(
    `select count(*)::text as n
     from inferred_game_segments
     where ended_at is not null
       and rp_delta is not null
       and rp_delta <> 0
       and (trigger_signals->>'reason') is distinct from 'legend_change'
       and ended_at >= now() - interval '7 days'`,
  );
  console.log(
    `\nInferred segments (last 7d, eligible for correlation heuristic): ${segClosed.rows[0]?.n ?? "0"}`,
  );

  console.log("\n--- How to read ---");
  console.log(
    "Voice rows = join/leave/move events. Edges = scored guess that two finished segments were same squad; evidence JSON has vc/time/legend/rp breakdown.",
  );

  await pool.end();
}

run().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
