/** Base URL for worker HTTP API (sync trigger, health). Matches `/api/sync/now` and dashboard health probe. */
export function getWorkerBaseUrl(): string {
  return process.env.WORKER_BASE_URL ?? `http://localhost:${process.env.WORKER_API_PORT ?? 4100}`;
}

/** Base URL for Discord bot health HTTP server. */
export function getDiscordBotBaseUrl(): string {
  return process.env.DISCORD_BOT_BASE_URL ?? `http://localhost:${process.env.DISCORD_BOT_PORT ?? 4300}`;
}
