import { pool } from "../client.js";

type TIngestionStart = {
  provider: string;
  runType: string;
  guildId: string | null;
  trackedAccountId: string | null;
};

type TIngestionFinish = {
  runId: string;
  success: boolean;
  statusCode: number | null;
  errorMessage: string | null;
  processedItems: number;
};

export async function startIngestionRun(input: TIngestionStart): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `
    insert into ingestion_runs (provider, run_type, guild_id, tracked_account_id)
    values ($1, $2, $3, $4)
    returning id
    `,
    [input.provider, input.runType, input.guildId, input.trackedAccountId]
  );
  return result.rows[0].id;
}

export async function finishIngestionRun(input: TIngestionFinish): Promise<void> {
  await pool.query(
    `
    update ingestion_runs
    set
      finished_at = now(),
      success = $2,
      status_code = $3,
      error_message = $4,
      processed_items = $5
    where id = $1
    `,
    [input.runId, input.success, input.statusCode, input.errorMessage, input.processedItems]
  );
}
