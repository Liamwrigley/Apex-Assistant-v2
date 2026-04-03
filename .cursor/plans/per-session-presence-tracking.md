# Per-session tracking aligned with Live Presence (revised)

**Scope: purely per tracked player.** No party matching, no squad/teammate lists, no “who they played with,” no peer tables or API fields for other players.

## Constraints (explicit)

Do **not** use these existing tables for this feature (no new reads, writes, or coupling):

- `ingestion_runs`
- `matches`
- `match_participants`

Existing match ingestion in the worker may remain as-is elsewhere; this feature does not depend on it.

## Context (unchanged)

- Live Presence uses [`evaluateRealtimePresence`](apps/web/lib/realtime-presence.ts) (15-minute freshness for **display** only).
- Worker updates `tracked_accounts` realtime columns each ingest; there is no presence history without new tables.
- **RP** is available on each ingest as `rank.rankScore` from the stats provider (same value written to `rank_snapshots` today). Session deltas can be stored entirely on new session rows without reading `rank_snapshots` if desired.

## When session data is stored (answers: not only “when UI shows online”)

Writes go through the **worker presence FSM** (same online/in_game/offline **rules** as the UI, **without** the 15-minute freshness gate). Ingest may still run on a schedule for all accounts; the session tables only change as follows:

1. **Session opens** — On transition **inactive → active** (worker-derived “visible active” = online or in_game per shared rules): insert `play_sessions` with `started_at`, `opening_rank_score` / `latest_rank_score` from current `rank.rankScore`, `ended_at` null.

2. **While the session stays open** — On **each successful ingest** where presence remains active: update `latest_rank_score` from `rank.rankScore`; upsert `play_session_legends` when derived status is **in_game** and `realtime_selected_legend` is set.

3. **Session closes** — On transition **active → inactive**: set `ended_at` (and optionally copy a final `latest_rank_score` on that tick). After that, **no further updates** to that session row until a **new** session starts later.

4. **When the player is inactive (offline)** — No new session rows, no legend upserts, no RP updates on `play_sessions` for that player until they become active again.

So: **persistence is tied to “active presence” windows from the worker**, not to “card visible on dashboard” (which also requires fresh `realtimeUpdatedAt`). Legend rows are **additional**: only when **in_game** + legend present, still only during an open session.

## Design: freshness vs session boundaries

- **UI**: Keep `evaluateRealtimePresence` for **which players appear** in Live Presence and Recent Sessions eligibility as needed; session **content** (RP delta, legends, duration) comes from DB.
- **Worker FSM**: Same flag/text rules as the UI, **without** the 15-minute stale cutoff when comparing previous DB row vs new payload.

Shared logic lives in **`@apex-assistant/core`**; web re-exports/wraps with freshness for display.

## Data model (only new tables)

**1. `play_sessions`**

- `id`, `tracked_account_id` (FK), `started_at`, `ended_at` (nullable while open)
- `opening_rank_score`, `latest_rank_score` (nullable; updated from ingest `rank.rankScore`)
- Indexes: `(tracked_account_id, started_at desc)`, partial index on open rows; index `(ended_at desc)` or composite for “recent completed” by guild (via join).

**2. `play_session_legends`**

- **This player only**: which legends **they** selected while in game during the session.
- Source: `realtime_selected_legend` when derived status is `in_game` (same rules as UI, no freshness in worker).
- Upsert on each qualifying ingest. No linkage to other accounts or players.

No peer/squad/teammate tables and no cross-player correlation.

## Worker flow ([`ingestTrackedAccount`](apps/worker/src/services/ingestionService.ts))

1. After `getRank`, derive `prev` / `next` presence using core `derivePresenceForSessionTransition` (no freshness).
2. `active` = online or in_game (aligned with visibility rules).
3. Open / update / close `play_sessions`; maintain `opening_rank_score` / `latest_rank_score` from `rank.rankScore`.
4. While session open: upsert `play_session_legends` when in game + `realtime_selected_legend` present.

Do not write or read `ingestion_runs`, `matches`, or `match_participants` for this feature.

## Web — Live Presence cards (layout refresh)

**Goal:** Present session context clearly without cramming chips only.

- **Restructure** the Live Presence card in [`apps/web/app/page.tsx`](apps/web/app/page.tsx) (or extract a small presentational component): e.g. clear blocks for **identity** (IGN, platform, rank strip), **activity** (in game / state / lobby as today), and **this session**:
  - **Session RP change**: `latest_rank_score - opening_rank_score` with signed formatting (+/-) and em dash when null.
  - **Legends this session**: readable list or compact chips (names; reuse legend icons where [`getLegendIconUrl`](apps/web/app/page.tsx) applies).
  - **Optional:** **Session so far** — elapsed time `now - started_at` for open sessions only (server-rendered “as of page load”; auto-refresh already ~60s).

- Batch-load open session + legends for rows that pass `evaluateRealtimePresence` (and same dedupe as today: [`presenceDedupeKey`](apps/web/app/page.tsx)).

## Web — new “Recent sessions” section

New dashboard **section** (below hero stats / near Live Presence — order TBD): table or card list of **completed** sessions.

**Query:** `play_sessions` where `ended_at is not null`, join `tracked_accounts` for guild filter + `ign` / `platform`, order by `ended_at desc`, limit ~15–25. Apply the **noise filter** in SQL (e.g. `WHERE` / `EXISTS` on legends) or in the app layer after loading legends — same result.

**Per row, show:**

- **Player** — `ign` + platform label (match existing chip style).
- **RP delta** — `latest_rank_score - opening_rank_score` (null-safe, signed).
- **Characters played** — distinct `legend` from `play_session_legends` for that `play_session_id` (comma-separated or chips).
- **Play time** — `ended_at - started_at`, human-readable duration (add small `formatDuration` helper if none exists).
- **Finished** — relative time on `ended_at` via [`formatRelativeTime`](apps/web/lib/format-relative-time.ts) (e.g. “2 hours ago”; wording can be “Finished …” in the UI).

**Note:** Only list sessions for tracked accounts in the current guild (same as dashboard). **Filter out** completed sessions that would be empty signal: omit a row when **`opening_rank_score` and `latest_rank_score` are both null** and the session has **no** `play_session_legends` rows. Otherwise show the row (partial data is fine).

## Types / repo / schema

- Types in [`packages/core`](packages/core/src/types.ts) as needed.
- New repo e.g. `playSessionsRepo.ts`: open-session CRUD, legend upsert, `getOpenSessionSummariesForTrackedAccountIds`, `getRecentCompletedSessionsByGuild(guildId, limit)` returning rows + aggregated legends.
- Export from db package; append tables to [`packages/db/schema.sql`](packages/db/schema.sql).

## Testing

- Unit tests: core presence derivation parity (display vs transition).
- Manual: session open/close, Live Presence session block, Recent sessions rows (delta, legends, duration, relative finished).

## Todos

1. Extract shared presence derivation to `@apex-assistant/core`; web keeps 15m freshness for display gating where needed.
2. Add `play_sessions` and `play_session_legends` (schema only — excluded tables untouched).
3. Implement `playSessionsRepo` (FSM helpers, open-session batch for cards, recent completed for guild).
4. Hook session FSM + legend upsert in worker using rank/realtime only.
5. **Live Presence:** redesign card layout; show session RP delta, legends this session, optional elapsed for open session.
6. **Recent sessions:** new dashboard section + data load; columns: player, RP delta, characters, duration, finished-ago; **exclude** rows with both RP null and zero legends.
