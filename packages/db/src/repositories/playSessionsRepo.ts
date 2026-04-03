import type { TDerivedPresenceStatus } from "@apex-assistant/core";
import { pool } from "../client.js";

export type TOpenSessionSummary = {
  trackedAccountId: string;
  sessionId: string;
  startedAt: Date;
  openingRankScore: number | null;
  latestRankScore: number | null;
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
  legends: string[];
};

export async function syncPlaySessionIngest(input: {
  trackedAccountId: string;
  prevActive: boolean;
  nextActive: boolean;
  nextStatus: TDerivedPresenceStatus;
  rankScore: number;
  selectedLegend: string | null;
}): Promise<void> {
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
            latest_rank_score = $2
          where id = $1
          `,
          [openId, input.rankScore]
        );
      }
      await client.query("COMMIT");
      return;
    }

    let sessionId: string;

    if (!input.prevActive && input.nextActive) {
      if (openId) {
        await client.query(
          `
          update play_sessions
          set
            ended_at = now(),
            latest_rank_score = $2
          where id = $1
          `,
          [openId, input.rankScore]
        );
      }
      const ins = await client.query<{ id: string }>(
        `
        insert into play_sessions (tracked_account_id, opening_rank_score, latest_rank_score)
        values ($1, $2, $2)
        returning id
        `,
        [input.trackedAccountId, input.rankScore]
      );
      sessionId = ins.rows[0].id;
    } else if (openId) {
      await client.query(
        `
        update play_sessions
        set latest_rank_score = $2
        where id = $1
        `,
        [openId, input.rankScore]
      );
      sessionId = openId;
    } else {
      const ins = await client.query<{ id: string }>(
        `
        insert into play_sessions (tracked_account_id, opening_rank_score, latest_rank_score)
        values ($1, $2, $2)
        returning id
        `,
        [input.trackedAccountId, input.rankScore]
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
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
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
  }>(
    `
    select
      id,
      tracked_account_id as "trackedAccountId",
      started_at as "startedAt",
      opening_rank_score as "openingRankScore",
      latest_rank_score as "latestRankScore"
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
    legends: bySession.get(r.id) ?? []
  }));
}

export async function getRecentCompletedSessionsByGuild(
  guildId: string,
  limit = 20
): Promise<TRecentCompletedSessionRow[]> {
  const sessions = await pool.query<{
    sessionId: string;
    trackedAccountId: string;
    ign: string;
    platform: string;
    startedAt: Date;
    endedAt: Date;
    openingRankScore: number | null;
    latestRankScore: number | null;
  }>(
    `
    select
      ps.id as "sessionId",
      ps.tracked_account_id as "trackedAccountId",
      ta.ign,
      ta.platform,
      ps.started_at as "startedAt",
      ps.ended_at as "endedAt",
      ps.opening_rank_score as "openingRankScore",
      ps.latest_rank_score as "latestRankScore"
    from play_sessions ps
    join tracked_accounts ta on ta.id = ps.tracked_account_id
    where ta.guild_id = $1
      and ps.ended_at is not null
      and not (
        ps.opening_rank_score is null
        and ps.latest_rank_score is null
        and not exists (
          select 1 from play_session_legends psl where psl.play_session_id = ps.id
        )
      )
    order by ps.ended_at desc
    limit $2
    `,
    [guildId, limit]
  );
  if (sessions.rows.length === 0) {
    return [];
  }
  const sessionIds = sessions.rows.map((r) => r.sessionId);
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
    sessionId: r.sessionId,
    trackedAccountId: r.trackedAccountId,
    ign: r.ign,
    platform: r.platform,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    openingRankScore: r.openingRankScore,
    latestRankScore: r.latestRankScore,
    legends: bySession.get(r.sessionId) ?? []
  }));
}
