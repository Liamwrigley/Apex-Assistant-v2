import dotenv from "dotenv";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import express from "express";
import { AppError } from "@apex-assistant/core";
import { getIngestionQueueStats } from "@apex-assistant/db";
import { ingestGuild, getProviderHealth, ingestNextDueTrackedAccount } from "./services/ingestionService.js";

dotenv.config({ path: resolve(process.cwd(), "../../.env") });

const app = express();
app.use(express.json());

const port = Number(process.env.WORKER_API_PORT ?? 4100);
const pollMinutes = Number(process.env.INGEST_POLL_MINUTES ?? 5);
const defaultGuildId = process.env.DISCORD_GUILD_ID;
const debugLogs = (process.env.DEBUG_LOGS ?? "false").toLowerCase() === "true";
const workerId = process.env.WORKER_ID ?? `worker-${randomUUID().slice(0, 8)}`;
const leaseSeconds = Number(process.env.INGEST_CLAIM_LEASE_SECONDS ?? Math.max(120, pollMinutes * 60));
const concurrency = Math.max(1, Number(process.env.INGEST_WORKER_CONCURRENCY ?? 1));
const idleSleepMs = Math.max(250, Number(process.env.INGEST_IDLE_SLEEP_MS ?? 1500));

function workerLog(message: string, meta?: Record<string, unknown>) {
  if (!debugLogs) {
    return;
  }
  const payload = meta ? ` ${JSON.stringify(meta)}` : "";
  console.log(`[worker] ${message}${payload}`);
}

app.get("/health", async (_req, res) => {
  const queue = await getIngestionQueueStats(defaultGuildId);
  res.json({
    ok: true,
    providers: getProviderHealth(),
    queue,
    worker: {
      workerId,
      pollMinutes,
      leaseSeconds,
      concurrency,
      idleSleepMs
    }
  });
});

app.post("/ingest/:guildId", async (req, res) => {
  try {
    const signature = req.headers["x-app-secret"];
    if (process.env.APP_SHARED_SECRET && signature !== process.env.APP_SHARED_SECRET) {
      throw new AppError("Invalid signature.", 401, "UNAUTHORIZED");
    }
    const guildId = req.params.guildId;
    workerLog("manual ingest request", { guildId });
    const result = await ingestGuild(guildId);
    workerLog("manual ingest complete", { guildId, processed: result.processed, failed: result.failed });
    res.status(202).json(result);
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    const message = error instanceof Error ? error.message : "Unknown error";
    workerLog("manual ingest error", { statusCode, message });
    res.status(statusCode).json({ error: message });
  }
});

app.post("/webhook/matches", async (req, res) => {
  // Placeholder endpoint to support provider webhook mode.
  // In MVP, poller is the primary mode and this can be expanded
  // once the exact provider payload shape is finalized.
  res.status(202).json({ accepted: true, received: req.body ? 1 : 0 });
});

app.listen(port, () => {
  console.log(`Worker API listening on :${port}`);
});

if (defaultGuildId) {
  const sleep = (ms: number) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

  const runWorkerLoop = async (loopIndex: number) => {
    workerLog("per-player worker loop start", {
      guildId: defaultGuildId,
      workerId,
      loopIndex,
      pollMinutes,
      leaseSeconds
    });
    while (true) {
      try {
        const next = await ingestNextDueTrackedAccount({
          guildId: defaultGuildId,
          pollMinutes,
          leaseSeconds,
          workerId: `${workerId}-${loopIndex}`
        });
        if (!next.processed) {
          await sleep(idleSleepMs);
        }
      } catch (error) {
        console.error("Per-player ingestion loop failed", error);
        await sleep(idleSleepMs);
      }
    }
  };

  for (let i = 0; i < concurrency; i += 1) {
    void runWorkerLoop(i);
  }
}
