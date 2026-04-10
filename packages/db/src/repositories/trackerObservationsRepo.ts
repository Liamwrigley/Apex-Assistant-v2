import { pool } from "../client.js";

export type TTrackerObservationRow = {
  id: string;
  trackedAccountId: string;
  capturedAt: Date;
  legendName: string;
  trackerKey: string;
  displayName: string;
  value: number;
  globalFlag: boolean | null;
  dataIndex: number;
  source: "selected" | "all";
  selectedLegendAtPoll: string | null;
};

export type TTrackerObservationInsert = {
  legendName: string;
  trackerKey: string;
  displayName: string;
  value: number;
  globalFlag: boolean | null;
  dataIndex: number;
  source: "selected" | "all";
};

/** Insert one poll batch; use a single capturedAt for all rows in the batch. */
export async function insertTrackerObservationsBatch(params: {
  trackedAccountId: string;
  capturedAt: Date;
  selectedLegendAtPoll: string | null;
  rows: TTrackerObservationInsert[];
}): Promise<void> {
  if (params.rows.length === 0) return;
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let i = 1;
  for (const r of params.rows) {
    placeholders.push(
      `($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++})`
    );
    values.push(
      params.trackedAccountId,
      params.capturedAt,
      r.legendName,
      r.trackerKey,
      r.displayName,
      r.value,
      r.globalFlag,
      r.dataIndex,
      r.source,
      params.selectedLegendAtPoll
    );
  }
  await pool.query(
    `insert into tracker_stat_observations (
       tracked_account_id, captured_at, legend_name, tracker_key, display_name,
       value, global_flag, data_index, source, selected_legend_at_poll
     )
     values ${placeholders.join(", ")}`,
    values
  );
}

/** Latest poll snapshot for one legend: all rows sharing max(captured_at) for that legend. */
export async function getLatestTrackerSnapshotForLegend(
  trackedAccountId: string,
  legendName: string
): Promise<TTrackerObservationRow[]> {
  const normalized = legendName.trim();
  if (!normalized) {
    return [];
  }
  const result = await pool.query<TTrackerObservationRow>(
    `
    with latest as (
      select max(captured_at) as t
      from tracker_stat_observations
      where tracked_account_id = $1::uuid
        and legend_name = $2
    )
    select
      id,
      tracked_account_id as "trackedAccountId",
      captured_at as "capturedAt",
      legend_name as "legendName",
      tracker_key as "trackerKey",
      display_name as "displayName",
      value,
      global_flag as "globalFlag",
      data_index as "dataIndex",
      source,
      selected_legend_at_poll as "selectedLegendAtPoll"
    from tracker_stat_observations, latest
    where tracked_account_id = $1::uuid
      and legend_name = $2
      and captured_at = latest.t
    order by data_index asc, tracker_key asc
    `,
    [trackedAccountId, normalized]
  );
  return result.rows;
}

export type TTrackerStatDelta = {
  legendName: string;
  trackerKey: string;
  dataIndex: number;
  displayName: string;
  endValue: number;
  startValue: number | null;
  delta: number | null;
};

/**
 * Range deltas per (legend_name, tracker_key, data_index): end = latest value;
 * start = latest at/before window start, else earliest strictly after (same logic as career stat deltas).
 */
export async function getTrackerStatDeltasForTrackedAccount(
  trackedAccountId: string,
  hours: number
): Promise<TTrackerStatDelta[]> {
  const clampedHours = Number.isFinite(hours)
    ? Math.min(Math.max(Math.trunc(hours), 1), 8760)
    : 24;

  const result = await pool.query<{
    legendName: string;
    trackerKey: string;
    dataIndex: number;
    displayName: string;
    endValue: number;
    startValue: number | null;
  }>(
    `
    with ws as (
      select (now() - ($2::int * interval '1 hour')) as t
    ),
    end_vals as (
      select distinct on (legend_name, tracker_key, data_index)
        legend_name as "legendName",
        tracker_key as "trackerKey",
        data_index as "dataIndex",
        display_name as "displayName",
        value as "endValue"
      from tracker_stat_observations
      where tracked_account_id = $1::uuid
      order by legend_name, tracker_key, data_index, captured_at desc
    ),
    before_snap as (
      select distinct on (o.legend_name, o.tracker_key, o.data_index)
        o.legend_name,
        o.tracker_key,
        o.data_index,
        o.value as sv
      from tracker_stat_observations o
      cross join ws
      where o.tracked_account_id = $1::uuid
        and o.captured_at <= ws.t
      order by o.legend_name, o.tracker_key, o.data_index, o.captured_at desc
    ),
    first_snap as (
      select distinct on (o.legend_name, o.tracker_key, o.data_index)
        o.legend_name,
        o.tracker_key,
        o.data_index,
        o.value as fv
      from tracker_stat_observations o
      cross join ws
      where o.tracked_account_id = $1::uuid
        and o.captured_at > ws.t
      order by o.legend_name, o.tracker_key, o.data_index, o.captured_at asc
    )
    select
      e."legendName",
      e."trackerKey",
      e."dataIndex",
      e."displayName",
      e."endValue",
      coalesce(b.sv, f.fv) as "startValue"
    from end_vals e
    left join before_snap b
      on b.legend_name = e."legendName"
     and b.tracker_key = e."trackerKey"
     and b.data_index = e."dataIndex"
    left join first_snap f
      on f.legend_name = e."legendName"
     and f.tracker_key = e."trackerKey"
     and f.data_index = e."dataIndex"
    `,
    [trackedAccountId, clampedHours]
  );

  return result.rows.map((row) => {
    const start = row.startValue;
    const end = row.endValue;
    const delta =
      start !== null && Number.isFinite(start) && Number.isFinite(end) ? end - start : null;
    return {
      legendName: row.legendName,
      trackerKey: row.trackerKey,
      dataIndex: row.dataIndex,
      displayName: row.displayName,
      endValue: end,
      startValue: start,
      delta
    };
  });
}

export async function hasAnyTrackerObservations(trackedAccountId: string): Promise<boolean> {
  const r = await pool.query<{ c: string }>(
    `select count(*)::text as c from tracker_stat_observations where tracked_account_id = $1::uuid limit 1`,
    [trackedAccountId]
  );
  return Number(r.rows[0]?.c ?? 0) > 0;
}
