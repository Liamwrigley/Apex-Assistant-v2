# Apex Assistant

Hybrid Apex Legends tracker with a Vercel-first UI/API, Railway ingestion workers, and a Discord bot.

## Monorepo layout

- `apps/web`: Next.js dashboard + API routes (Vercel target).
- `apps/worker`: Ingestion worker (ApexLegendsAPI polling, game segment inference).
- `apps/discord-bot`: Discord slash commands for tracking and leaderboard access.
- `packages/core`: Shared domain types, guardrails, retry, and rate-limit helpers.
- `packages/db`: PostgreSQL schema, migration script, and repositories.

## Quick start

1. Copy `.env.example` to `.env` and fill secrets.
2. Install dependencies:
   - `npm install`
3. Apply DB schema:
   - `npm run migrate -w @apex-assistant/db`
4. Run services:
   - Web: `npm run dev -w @apex-assistant/web`
   - Worker: `npm run dev -w @apex-assistant/worker`
   - Discord bot: `npm run dev -w @apex-assistant/discord-bot`
5. Trigger ingestion:
   - Discord: `/ingest now` (admin only), or
   - HTTP: `POST /ingest/:guildId` on worker API.

## Deployment runbook

### Vercel (`apps/web`)

- In Vercel, set the project root to `apps/web`.
- Build command: `npm run build -w @apex-assistant/web`
- Install command: `npm install`
- Required env vars:
  - `DATABASE_URL`
  - `APP_SHARED_SECRET`
  - `DISCORD_GUILD_ID` (if you want homepage leaderboard preloaded)
  - `WEB_BASE_URL` (set to your Vercel domain URL)

### Railway (`apps/worker`)

- Create a Railway service from the repo with root directory `apps/worker`.
- `apps/worker/railway.toml` is included with build/start/healthcheck defaults.
- Required env vars:
  - `DATABASE_URL`
  - `APEXLEGENDSAPI_KEY`
  - `APP_SHARED_SECRET`
  - `DISCORD_GUILD_ID` (optional default polling target)
  - `WORKER_API_PORT` (Railway sets `PORT`; map if desired)

### Railway (`apps/discord-bot`)

- Create a second Railway service with root directory `apps/discord-bot`.
- `apps/discord-bot/railway.toml` is included.
- Required env vars:
  - `DATABASE_URL`
  - `DISCORD_TOKEN`
  - `DISCORD_CLIENT_ID`
  - `DISCORD_GUILD_ID` (recommended for fast slash command sync in one server)
  - `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS` (optional)
  - `DISCORD_BOT_PORT` (for `/health` endpoint)

### First deploy sequence

1. Deploy `apps/worker` and run one manual ingest request.
2. Deploy `apps/web` and verify `/api/leaderboard`.
3. Deploy `apps/discord-bot` and verify slash commands in Discord.

## Core API routes

- `POST /api/track`
- `DELETE /api/track/:id`
- `GET /api/leaderboard?guildId=...`
Identity headers expected by protected routes:
- `x-user-id`
- `x-guild-id`
- `x-role` (`member` or `admin`)
- `x-app-secret` (must match `APP_SHARED_SECRET` when set)

## Notes

- Stats provider is ApexLegendsAPI only.
- Game segments are inferred from rank snapshots and presence changes (no match history API).
- Ownership rules enforce that members can only remove their own tracked accounts unless they are admins.
- Worker health endpoint: `GET /health`.
- Discord bot health endpoint: `GET /health` on `DISCORD_BOT_PORT`.
