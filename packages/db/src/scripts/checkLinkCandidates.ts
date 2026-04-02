/**
 * Report cross-platform tracked rows that share an auto-link fingerprint
 * (same guild, owner, normalized IGN, distinct platforms) or the same external_player_id,
 * but are not all in one identity_group_id.
 *
 * Flags:
 *   --json           Structured output
 *   --include-ok     Include clusters already fully linked
 *   --apply          Fix unlinked / partial clusters (manual_link events; actor = LINK_APPLY_ACTOR env or first owner id)
 *   --dry-run        With --apply: validate and log only; transaction rolled back
 *
 * Worker auto-links via autoLinkTrackedAccountByExactFingerprint on ingest; this tool backfills gaps.
 */
import dotenv from "dotenv";
import { resolve } from "node:path";
import type { PoolClient } from "pg";
import { pool } from "../client.js";

type TRow = {
  id: string;
  guildId: string;
  ownerUserId: string;
  ign: string;
  platform: string;
  identityGroupId: string | null;
  externalPlayerId: string | null;
  externalSource: string | null;
};

type TIssueKind = "matching_ign" | "matching_external_id";

type TIssue = {
  kind: TIssueKind;
  status: "unlinked" | "partial" | "conflict" | "ok";
  guildId: string;
  ownerUserId: string;
  igns: string[];
  platforms: string[];
  accountIds: string[];
  identityGroupIds: (string | null)[];
  externalPlayerId?: string | null;
};

type TIssueWithCluster = { issue: TIssue; cluster: TRow[] };

const JSON_OUT = process.argv.includes("--json");
const INCLUDE_OK = process.argv.includes("--include-ok");
const APPLY = process.argv.includes("--apply");
const DRY_RUN = process.argv.includes("--dry-run");

function normIgn(ign: string): string {
  return ign.trim().toLowerCase();
}

function accountSetKey(ids: string[]): string {
  return [...ids].sort().join(",");
}

/** Status only; null if not a multi-platform cluster. */
function clusterStatus(
  rows: TRow[]
): "unlinked" | "partial" | "conflict" | "ok" | null {
  if (rows.length < 2) {
    return null;
  }
  const platforms = [...new Set(rows.map((r) => r.platform))];
  if (platforms.length < 2) {
    return null;
  }

  const groupIds = rows.map((r) => r.identityGroupId);
  const nonNullGroups = [
    ...new Set(groupIds.filter((g): g is string => g != null))
  ];
  const hasNull = groupIds.some((g) => g == null);

  if (nonNullGroups.length > 1) {
    return "conflict";
  }
  if (nonNullGroups.length === 1 && hasNull) {
    return "partial";
  }
  if (nonNullGroups.length === 1 && !hasNull) {
    return "ok";
  }
  return "unlinked";
}

function analyzeCluster(rows: TRow[], kind: TIssueKind): TIssue | null {
  const status = clusterStatus(rows);
  if (status == null) {
    return null;
  }

  if (status === "ok" && !INCLUDE_OK) {
    return null;
  }

  const igns = [...new Set(rows.map((r) => r.ign))];
  const sorted = [...rows].sort((a, b) => a.platform.localeCompare(b.platform));

  return {
    kind,
    status,
    guildId: rows[0]!.guildId,
    ownerUserId: rows[0]!.ownerUserId,
    igns,
    platforms: [...new Set(sorted.map((r) => r.platform))].sort(),
    accountIds: sorted.map((r) => r.id),
    identityGroupIds: sorted.map((r) => r.identityGroupId),
    externalPlayerId:
      kind === "matching_external_id" ? rows[0]!.externalPlayerId : undefined
  };
}

function buildBuckets(rows: TRow[]): {
  ignBuckets: Map<string, TRow[]>;
  uidBuckets: Map<string, TRow[]>;
} {
  const ignBuckets = new Map<string, TRow[]>();
  const uidBuckets = new Map<string, TRow[]>();

  for (const row of rows) {
    const ignKey = `${row.guildId}\0${row.ownerUserId}\0${normIgn(row.ign)}`;
    const ignList = ignBuckets.get(ignKey);
    if (ignList) {
      ignList.push(row);
    } else {
      ignBuckets.set(ignKey, [row]);
    }

    if (row.externalPlayerId) {
      const uidKey = `${row.guildId}\0${row.ownerUserId}\0${row.externalPlayerId}\0${row.externalSource ?? ""}`;
      const ulist = uidBuckets.get(uidKey);
      if (ulist) {
        ulist.push(row);
      } else {
        uidBuckets.set(uidKey, [row]);
      }
    }
  }
  return { ignBuckets, uidBuckets };
}

function collectIssues(
  ignBuckets: Map<string, TRow[]>,
  uidBuckets: Map<string, TRow[]>
): TIssueWithCluster[] {
  const items: TIssueWithCluster[] = [];
  const seenIds = new Set<string>();

  for (const cluster of ignBuckets.values()) {
    const issue = analyzeCluster(cluster, "matching_ign");
    if (!issue) {
      continue;
    }
    seenIds.add(accountSetKey(cluster.map((r) => r.id)));
    items.push({ issue, cluster });
  }

  for (const cluster of uidBuckets.values()) {
    const issue = analyzeCluster(cluster, "matching_external_id");
    if (!issue) {
      continue;
    }
    const key = accountSetKey(cluster.map((r) => r.id));
    if (seenIds.has(key)) {
      continue;
    }
    seenIds.add(key);
    items.push({ issue, cluster });
  }

  items.sort((a, b) => {
    const rank = (s: TIssue["status"]) =>
      s === "conflict" ? 0 : s === "partial" ? 1 : s === "unlinked" ? 2 : 3;
    const rd = rank(a.issue.status) - rank(b.issue.status);
    if (rd !== 0) {
      return rd;
    }
    return (
      a.issue.guildId.localeCompare(b.issue.guildId) ||
      a.issue.ownerUserId.localeCompare(b.issue.ownerUserId)
    );
  });

  return items;
}

async function applyCluster(
  client: PoolClient,
  snapshotCluster: TRow[],
  actorUserId: string
): Promise<{ result: "applied" | "skipped" | "noop"; detail?: string }> {
  const ids = snapshotCluster.map((r) => r.id);
  const locked = await client.query<TRow>(
    `
    select
      id,
      guild_id as "guildId",
      owner_user_id as "ownerUserId",
      ign,
      platform,
      identity_group_id as "identityGroupId",
      external_player_id as "externalPlayerId",
      external_source as "externalSource"
    from tracked_accounts
    where id = any($1::uuid[])
      and is_active = true
    order by platform, created_at asc
    for update
    `,
    [ids]
  );
  const rows = locked.rows;
  const status = clusterStatus(rows);
  if (status == null) {
    return { result: "skipped", detail: "not_multiplatform" };
  }
  if (status === "conflict" || status === "ok") {
    return { result: "skipped", detail: status };
  }

  const groupIds = rows.map((r) => r.identityGroupId);
  const nonNullGroups = [
    ...new Set(groupIds.filter((g): g is string => g != null))
  ];
  let resolvedGroupId: string;
  if (nonNullGroups.length === 1) {
    resolvedGroupId = nonNullGroups[0]!;
  } else {
    const gen = await client.query<{ id: string }>(
      "select gen_random_uuid()::text as id"
    );
    resolvedGroupId = gen.rows[0]!.id;
  }

    const anchorId = rows[0]!.id;
    let changed = 0;

    for (const row of rows) {
      if (row.identityGroupId === resolvedGroupId) {
        continue;
      }
      const oldGroupId = row.identityGroupId;
      const peerId =
        rows.find((r) => r.id !== row.id)?.id ?? anchorId;
      if (DRY_RUN) {
        changed += 1;
        continue;
      }
    await client.query(
      `
      update tracked_accounts
      set identity_group_id = $2::uuid, updated_at = now()
      where id = $1
      `,
      [row.id, resolvedGroupId]
    );
    await client.query(
      `
      insert into identity_link_events
        (guild_id, actor_user_id, event_type, tracked_account_id, peer_tracked_account_id, old_group_id, new_group_id, reason)
      values
        ($1, $2, 'manual_link', $3, $4, $5::uuid, $6::uuid, $7)
      `,
      [
        row.guildId,
        actorUserId,
        row.id,
        peerId,
        oldGroupId,
        resolvedGroupId,
        "script_checkLinkCandidates_apply"
      ]
    );
    changed += 1;
  }

  if (changed === 0) {
    return { result: "noop", detail: "already_resolved" };
  }
  return { result: "applied", detail: DRY_RUN ? "dry_run" : undefined };
}

async function run(): Promise<void> {
  dotenv.config({ path: resolve(process.cwd(), "../../.env") });
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing. Ensure apex-assistant/.env exists.");
  }

  const result = await pool.query<TRow>(
    `
    select
      id,
      guild_id as "guildId",
      owner_user_id as "ownerUserId",
      ign,
      platform,
      identity_group_id as "identityGroupId",
      external_player_id as "externalPlayerId",
      external_source as "externalSource"
    from tracked_accounts
    where is_active = true
    order by guild_id, owner_user_id, platform, created_at asc
    `
  );

  const { ignBuckets, uidBuckets } = buildBuckets(result.rows);
  const items = collectIssues(ignBuckets, uidBuckets);
  const issues = items.map((x) => x.issue);

  let applyStats: {
    applied: number;
    skipped: number;
    noop: number;
    dryRun: boolean;
    actor: string;
  } | null = null;

  if (!JSON_OUT) {
    if (issues.length === 0) {
      console.log(
        "[link-check] No cross-platform clusters need linking (or use --include-ok to show already-linked pairs)."
      );
    } else {
      for (const i of issues) {
        const gidShort = i.identityGroupIds.map((g) => g ?? "null").join(", ");
        console.log(
          `[link-check] ${i.status} | ${i.kind} | guild=${i.guildId} owner=${i.ownerUserId} platforms=[${i.platforms.join(", ")}] igns=[${i.igns.join(" | ")}] groups=[${gidShort}] ids=[${i.accountIds.join(", ")}]` +
            (i.externalPlayerId ? ` uid=${i.externalPlayerId}` : "")
        );
      }
      const byStatus = issues.reduce<Record<string, number>>((acc, x) => {
        acc[x.status] = (acc[x.status] ?? 0) + 1;
        return acc;
      }, {});
      console.log(
        `[link-check] summary total=${issues.length} by_status=${JSON.stringify(byStatus)}`
      );
    }
  }

  if (APPLY) {
    const fixable = items.filter(
      (x) => x.issue.status === "unlinked" || x.issue.status === "partial"
    );
    const actor =
      process.env.LINK_APPLY_ACTOR?.trim() ||
      fixable[0]?.issue.ownerUserId ||
      "script_checkLinkCandidates";
    let applied = 0;
    let skipped = 0;
    let noop = 0;

    for (const { issue, cluster } of fixable) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const out = await applyCluster(client, cluster, actor);
        if (DRY_RUN) {
          await client.query("rollback");
        } else {
          await client.query("commit");
        }
        if (out.result === "applied") {
          applied += 1;
          if (!JSON_OUT) {
            console.log(
              `[link-check] ${DRY_RUN ? "dry-run " : ""}applied cluster owner=${issue.ownerUserId} platforms=[${issue.platforms.join(", ")}] igns=[${issue.igns.join(" | ")}]`
            );
          }
        } else if (out.result === "skipped") {
          skipped += 1;
        } else {
          noop += 1;
        }
      } catch (e) {
        await client.query("rollback");
        throw e;
      } finally {
        client.release();
      }
    }

    applyStats = { applied, skipped, noop, dryRun: DRY_RUN, actor };
    if (!JSON_OUT && fixable.length > 0) {
      console.log(
        `[link-check] apply complete applied=${applied} skipped=${skipped} noop=${noop} actor=${actor}${DRY_RUN ? " (rolled back)" : ""}`
      );
    }
  }

  if (JSON_OUT) {
    const payload: Record<string, unknown> = {
      count: issues.length,
      issues
    };
    if (applyStats) {
      payload.apply = applyStats;
    }
    console.log(JSON.stringify(payload, null, 2));
  }

  await pool.end();
}

run().catch((error: unknown) => {
  console.error("Link candidate check failed:", error);
  process.exit(1);
});
