import { pool } from "../client.js";

export type TPresenceSnapshot = {
  id: string;
  trackedAccountId: string;
  capturedAt: Date;
  selectedLegend: string | null;
  isInGame: boolean;
  lobbyState: string | null;
  currentState: string | null;
  currentStateAsText: string | null;
  derivedStatus: string;
};

/**
 * Insert a presence snapshot only if any tracked dimension changed
 * from the most recent snapshot for this account.
 * Returns the new row if inserted, or null if skipped (no change).
 */
export async function insertPresenceSnapshotIfChanged(input: {
  trackedAccountId: string;
  selectedLegend: string | null;
  isInGame: boolean;
  lobbyState: string | null;
  currentState: string | null;
  currentStateAsText: string | null;
  derivedStatus: string;
}): Promise<TPresenceSnapshot | null> {
  const result = await pool.query<TPresenceSnapshot>(
    `
    with latest as (
      select
        selected_legend,
        is_in_game,
        lobby_state,
        current_state,
        current_state_as_text,
        derived_status
      from presence_snapshots
      where tracked_account_id = $1
      order by captured_at desc
      limit 1
    )
    insert into presence_snapshots (
      tracked_account_id,
      selected_legend,
      is_in_game,
      lobby_state,
      current_state,
      current_state_as_text,
      derived_status
    )
    select $1, $2, $3, $4, $5, $6, $7
    where not exists (
      select 1 from latest
      where coalesce(selected_legend, '') = coalesce($2::text, '')
        and is_in_game = $3
        and coalesce(lobby_state, '') = coalesce($4::text, '')
        and coalesce(current_state, '') = coalesce($5::text, '')
        and coalesce(current_state_as_text, '') = coalesce($6::text, '')
        and derived_status = $7
    )
    returning
      id,
      tracked_account_id as "trackedAccountId",
      captured_at as "capturedAt",
      selected_legend as "selectedLegend",
      is_in_game as "isInGame",
      lobby_state as "lobbyState",
      current_state as "currentState",
      current_state_as_text as "currentStateAsText",
      derived_status as "derivedStatus"
    `,
    [
      input.trackedAccountId,
      input.selectedLegend,
      input.isInGame,
      input.lobbyState,
      input.currentState,
      input.currentStateAsText,
      input.derivedStatus
    ]
  );
  return result.rows[0] ?? null;
}

export async function getRecentPresenceSnapshots(
  trackedAccountId: string,
  limit = 100
): Promise<TPresenceSnapshot[]> {
  const result = await pool.query<TPresenceSnapshot>(
    `
    select
      id,
      tracked_account_id as "trackedAccountId",
      captured_at as "capturedAt",
      selected_legend as "selectedLegend",
      is_in_game as "isInGame",
      lobby_state as "lobbyState",
      current_state as "currentState",
      current_state_as_text as "currentStateAsText",
      derived_status as "derivedStatus"
    from presence_snapshots
    where tracked_account_id = $1
    order by captured_at desc
    limit $2
    `,
    [trackedAccountId, limit]
  );
  return result.rows;
}
