import type { TDerivedPresenceStatus } from "@apex-assistant/core";
import { pool } from "../client.js";

export type TOpenSessionSummary = {
  trackedAccountId: string;
  sessionId: string;
  startedAt: Date;
  openingRankScore: number | null;
  latestRankScore: number | null;
  openingRankName: string | null;
  openingRankDivision: string | null;
  openingRankIconUrl: string | null;
  latestRankName: string | null;
  latestRankDivision: string | null;
  latestRankIconUrl: string | null;
  legends: string[];
};

export type TRecentCompletedSessionRow = {
  sessionId: string;
  trackedAccountId: string;
  ign: string;
  platform: string;
  startedAt: Date;
  endedAt: Date;
  openingRankScore: number | null;
  latestRankScore: number | null;
  openingRankName: string | null;
  openingRankDivision: string | null;
  openingRankIconUrl: string | null;
  latestRankName: string | null;
  latestRankDivision: string | null;
  latestRankIconUrl: string | null;
  legends: string[];
};

export type TSyncPlaySessionResult = {
  sessionChanged: boolean;
};

export async function syncPlaySessionIngest(input: {
  trackedAccountId: string;
  prevActive: boolean;
  nextActive: boolean;
  nextStatus: TDerivedPresenceStatus;
  rankScore: number;
  rankName: string | null;
  rankDivision: string | null;
  rankIconUrl: string | null;
  selectedLegend: string | null;
}): Promise<TSyncPlaySessionResult> {
  const rn = input.rankName;
  const rd = input.rankDivision;
  const ri = input.rankIconUrl;
  const rs = input.rankScore;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const openRes = await client.query<{ id: string }>(
      `
      select id
      from play_sessions
      where tracked_account_id = $1 and ended_at is null
      for update
      `,
      [input.trackedAccountId]
    );
    const openId = openRes.rows[0]?.id;

    if (!input.nextActive) {
      if (openId) {
        await client.query(
          `
          update play_sessions
          set
            ended_at = now(),
            latest_rank_score = $2,
            latest_rank_name = $3,
            latest_rank_division = $4,
            latest_rank_icon_url = $5
          where id = $1
          `,
          [openId, rs, rn, rd, ri]
        );
      }
      await client.query("COMMIT");
      return { sessionChanged: !!openId };
    }

    let sessionId: string;

    if (!input.prevActive && input.nextActive) {
      if (openId) {
        await client.query(
          `
          update play_sessions
          set
            ended_at = now(),
            latest_rank_score = $2,
            latest_rank_name = $3,
            latest_rank_division = $4,
            latest_rank_icon_url = $5
          where id = $1
          `,
          [openId, rs, rn, rd, ri]
        );
      }
      const ins = await client.query<{ id: string }>(
        `
        insert into play_sessions (
          tracked_account_id,
          opening_rank_score,
          latest_rank_score,
          opening_rank_name,
          opening_rank_division,
          opening_rank_icon_url,
          latest_rank_name,
          latest_rank_division,
          latest_rank_icon_url
        )
        values ($1, $2, $2, $3, $4, $5, $3, $4, $5)
        returning id
        `,
        [input.trackedAccountId, rs, rn, rd, ri]
      );
      sessionId = ins.rows[0].id;
    } else if (openId) {
      await client.query(
        `
        update play_sessions
        set
          latest_rank_score = $2,
          latest_rank_name = $3,
          latest_rank_division = $4,
          latest_rank_icon_url = $5
        where id = $1
        `,
        [openId, rs, rn, rd, ri]
      );
      sessionId = openId;
    } else {
      const ins = await client.query<{ id: string }>(
        `
        insert into play_sessions (
          tracked_account_id,
          opening_rank_score,
          latest_rank_score,
          opening_rank_name,
          opening_rank_division,
          opening_rank_icon_url,
          latest_rank_name,
          latest_rank_division,
          latest_rank_icon_url
        )
        values ($1, $2, $2, $3, $4, $5, $3, $4, $5)
        returning id
        `,
        [input.trackedAccountId, rs, rn, rd, ri]
      );
      sessionId = ins.rows[0].id;
    }

    if (input.nextStatus === "in_game") {
      const legend = input.selectedLegend?.trim();
      if (legend) {
        await client.query(
          `
          insert into play_session_legends (play_session_id, legend, first_seen_at, last_seen_at, seen_polls)
          values ($1, $2, now(), now(), 1)
          on conflict (play_session_id, legend) do update set
            last_seen_at = now(),
            seen_polls = play_session_legends.seen_polls + 1
          `,
          [sessionId, legend]
        );
      }
    }

    await client.query("COMMIT");

    const sessionOpened = !input.prevActive && input.nextActive;
    const sessionCreatedFallback = !openId && input.nextActive;
    return { sessionChanged: sessionOpened || sessionCreatedFallback };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function getOpenSessionId(trackedAccountId: string): Promise<string | null> {
  const result = await pool.query<{ id: string }>(
    `select id from play_sessions where tracked_account_id = $1 and ended_at is null limit 1`,
    [trackedAccountId]
  );
  return result.rows[0]?.id ?? null;
}

export async function getOpenSessionSummariesForTrackedAccountIds(
  trackedAccountIds: string[]
): Promise<TOpenSessionSummary[]> {
  if (trackedAccountIds.length === 0) {
    return [];
  }
  const sessions = await pool.query<{
    id: string;
    trackedAccountId: string;
    startedAt: Date;
    openingRankScore: number | null;
    latestRankScore: number | null;
    openingRankName: string | null;
    openingRankDivision: string | null;
    openingRankIconUrl: string | null;
    latestRankName: string | null;
    latestRankDivision: string | null;
    latestRankIconUrl: string | null;
  }>(
    `
    select
      id,
      tracked_account_id as "trackedAccountId",
      started_at as "startedAt",
      opening_rank_score as "openingRankScore",
      latest_rank_score as "latestRankScore",
      opening_rank_name as "openingRankName",
      opening_rank_division as "openingRankDivision",
      opening_rank_icon_url as "openingRankIconUrl",
      latest_rank_name as "latestRankName",
      latest_rank_division as "latestRankDivision",
      latest_rank_icon_url as "latestRankIconUrl"
    from play_sessions
    where ended_at is null
      and tracked_account_id = any($1::uuid[])
    `,
    [trackedAccountIds]
  );
  if (sessions.rows.length === 0) {
    return [];
  }
  const sessionIds = sessions.rows.map((r) => r.id);
  const legendsRes = await pool.query<{ playSessionId: string; legend: string }>(
    `
    select play_session_id as "playSessionId", legend
    from play_session_legends
    where play_session_id = any($1::uuid[])
    order by legend asc
    `,
    [sessionIds]
  );
  const bySession = new Map<string, string[]>();
  for (const row of legendsRes.rows) {
    const list = bySession.get(row.playSessionId) ?? [];
    list.push(row.legend);
    bySession.set(row.playSessionId, list);
  }
  return sessions.rows.map((r) => ({
    trackedAccountId: r.trackedAccountId,
    sessionId: r.id,
    startedAt: r.startedAt,
    openingRankScore: r.openingRankScore,
    latestRankScore: r.latestRankScore,
    openingRankName: r.openingRankName,
    openingRankDivision: r.openingRankDivision,
    openingRankIconUrl: r.openingRankIconUrl,
    latestRankName: r.latestRankName,
    latestRankDivision: r.latestRankDivision,
    latestRankIconUrl: r.latestRankIconUrl,
    legends: bySession.get(r.id) ?? []
  }));
}

const completedSessionsBaseSql = `
  select
    ps.id as "sessionId",
    ps.tracked_account_id as "trackedAccountId",
    ta.ign,
    ta.platform,
    ps.started_at as "startedAt",
    ps.ended_at as "endedAt",
    ps.opening_rank_score as "openingRankScore",
    ps.latest_rank_score as "latestRankScore",
    ps.opening_rank_name as "openingRankName",
    ps.opening_rank_division as "openingRankDivision",
    ps.opening_rank_icon_url as "openingRankIconUrl",
    ps.latest_rank_name as "latestRankName",
    ps.latest_rank_division as "latestRankDivision",
    ps.latest_rank_icon_url as "latestRankIconUrl"
  from play_sessions ps
  join tracked_accounts ta on ta.id = ps.tracked_account_id
  where ta.is_active = true
    and ps.ended_at is not null
    and not (
      ps.opening_rank_score is null
      and ps.latest_rank_score is null
      and not exists (
        select 1 from play_session_legends psl where psl.play_session_id = ps.id
      )
    )
    and not (
      ps.opening_rank_score is not null
      and ps.latest_rank_score is not null
      and ps.opening_rank_score = ps.latest_rank_score
    )
`;

type TCompletedSessionRow = {
  sessionId: string;
  trackedAccountId: string;
  ign: string;
  platform: string;
  startedAt: Date;
  endedAt: Date;
  openingRankScore: number | null;
  latestRankScore: number | null;
  openingRankName: string | null;
  openingRankDivision: string | null;
  openingRankIconUrl: string | null;
  latestRankName: string | null;
  latestRankDivision: string | null;
  latestRankIconUrl: string | null;
};

async function mapSessionsWithLegends(
  rows: TCompletedSessionRow[]
): Promise<TRecentCompletedSessionRow[]> {
  if (rows.length === 0) {
    return [];
  }
  const sessionIds = rows.map((r) => r.sessionId);
  const legendsRes = await pool.query<{ playSessionId: string; legend: string }>(
    `
    select play_session_id as "playSessionId", legend
    from play_session_legends
    where play_session_id = any($1::uuid[])
    order by legend asc
    `,
    [sessionIds]
  );
  const bySession = new Map<string, string[]>();
  for (const row of legendsRes.rows) {
    const list = bySession.get(row.playSessionId) ?? [];
    list.push(row.legend);
    bySession.set(row.playSessionId, list);
  }
  return rows.map((r) => ({
    sessionId: r.sessionId,
    trackedAccountId: r.trackedAccountId,
    ign: r.ign,
    platform: r.platform,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    openingRankScore: r.openingRankScore,
    latestRankScore: r.latestRankScore,
    openingRankName: r.openingRankName,
    openingRankDivision: r.openingRankDivision,
    openingRankIconUrl: r.openingRankIconUrl,
    latestRankName: r.latestRankName,
    latestRankDivision: r.latestRankDivision,
    latestRankIconUrl: r.latestRankIconUrl,
    legends: bySession.get(r.sessionId) ?? []
  }));
}

/** Recent completed sessions across all active tracked accounts (no guild filter). */
export async function getRecentCompletedSessions(limit = 20): Promise<TRecentCompletedSessionRow[]> {
  const sessions = await pool.query<TCompletedSessionRow>(
    `${completedSessionsBaseSql}
    order by ps.ended_at desc
    limit $1
    `,
    [limit]
  );
  return mapSessionsWithLegends(sessions.rows);
}

export async function getRecentCompletedSessionsByGuild(
  guildId: string,
  limit = 20
): Promise<TRecentCompletedSessionRow[]> {
  const sessions = await pool.query<TCompletedSessionRow>(
    `${completedSessionsBaseSql}
    and ta.guild_id = $1
    order by ps.ended_at desc
    limit $2
    `,
    [guildId, limit]
  );
  return mapSessionsWithLegends(sessions.rows);
}

export async function getRecentCompletedSessionsByAccount(
  trackedAccountId: string,
  limit = 30
): Promise<TRecentCompletedSessionRow[]> {
  const sessions = await pool.query<TCompletedSessionRow>(
    `${completedSessionsBaseSql}
    and ps.tracked_account_id = $1
    order by ps.ended_at desc
    limit $2
    `,
    [trackedAccountId, limit]
  );
  return mapSessionsWithLegends(sessions.rows);
}
