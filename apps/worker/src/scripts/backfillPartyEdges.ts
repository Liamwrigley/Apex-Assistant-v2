/**
 * Re-run party correlation with a wider lookback window to pick up missed edges.
 * Run from repo root:
 *   npx tsx apps/worker/src/scripts/backfillPartyEdges.ts [hours]
 * Default: 24 hours. Example for 3 days: ... 72
 */
import dotenv from "dotenv";
import { resolve } from "node:path";

dotenv.config({ path: resolve(process.cwd(), ".env") });

import { correlateRecentSegments } from "../services/partyCorrelationService.js";
import { pool } from "@apex-assistant/db";

async function run(): Promise<void> {
  const hours = Number(process.argv[2] ?? 24);
  const windowMs = hours * 60 * 60 * 1000;

  console.log(`Re-running party correlation with ${hours}h lookback (${windowMs}ms)…`);
  const result = await correlateRecentSegments(windowMs);
  console.log(`Done — ${result.edgesCreated} edges created/updated.`);

  await pool.end();
}

run().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
