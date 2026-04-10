import dotenv from "dotenv";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import express from "express";
import { AppError } from "@apex-assistant/core";
import { getIngestionQueueStats } from "@apex-assistant/db";
import { ingestGuild, getProviderHealth, ingestNextDueTrackedAccount } from "./services/ingestionService.js";
import { correlateRecentSegments } from "./services/partyCorrelationService.js";

dotenv.config({ path: resolve(process.cwd(), "../../.env") });

const app = express();
app.use(express.json());

/** Railway / PaaS set PORT; local dev can use WORKER_API_PORT. */
const port = Number(process.env.PORT ?? process.env.WORKER_API_PORT ?? 4100);
const pollMinutes = Number(process.env.INGEST_POLL_MINUTES ?? 5);
const onlinePollSeconds = Number(process.env.INGEST_POLL_SECONDS_ONLINE ?? 30);
/** When set, poller only processes that guild; when unset, all guilds (multi-server). */
const defaultGuildId = process.env.DISCORD_GUILD_ID?.trim() || undefined;
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
  let queue: Awaited<ReturnType<typeof getIngestionQueueStats>> | null = null;
  try {
    queue = await getIngestionQueueStats(defaultGuildId);
  } catch {
    // Liveness must stay 200 for Railway; DB can be checked separately in logs/metrics.
  }
  res.status(200).json({
    ok: true,
    providers: getProviderHealth(),
    queue,
    dbReachable: queue !== null,
    worker: {
      workerId,
      pollMinutes,
      onlinePollSeconds,
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

app.listen(port, "0.0.0.0", () => {
  console.log(`Worker API listening on 0.0.0.0:${port}`);
});

const sleep = (ms: number) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

const runWorkerLoop = async (loopIndex: number) => {
  workerLog("per-player worker loop start", {
    guildId: defaultGuildId ?? "(all guilds)",
    workerId,
    loopIndex,
    pollMinutes,
    onlinePollSeconds,
    leaseSeconds
  });
  while (true) {
    try {
      const next = await ingestNextDueTrackedAccount({
        guildId: defaultGuildId,
        pollMinutes,
        onlinePollSeconds,
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

const partyCorrelationIntervalMs = Number(process.env.PARTY_CORRELATION_INTERVAL_MS ?? 5 * 60 * 1000);
const partyCorrelationWindowMs = Number(process.env.PARTY_CORRELATION_WINDOW_MS ?? 30 * 60 * 1000);

const runPartyCorrelationLoop = async () => {
  workerLog("party correlation loop start", { intervalMs: partyCorrelationIntervalMs });
  while (true) {
    try {
      const result = await correlateRecentSegments(partyCorrelationWindowMs);
      if (result.edgesCreated > 0) {
        workerLog("party correlation tick", { edgesCreated: result.edgesCreated });
      }
    } catch (error) {
      console.error("Party correlation loop error:", error);
    }
    await sleep(partyCorrelationIntervalMs);
  }
};

void runPartyCorrelationLoop();
