import dotenv from "dotenv";
import { resolve } from "node:path";
import { getStatsProvider, type TPlatform } from "@apex-assistant/core";
import { hasIgnConflictForDifferentExternalId, pool, updateTrackedAccountIgnById } from "../index.js";

type TRow = {
  id: string;
  ign: string;
  platform: TPlatform;
  externalPlayerId: string | null;
};

const PLATFORM_PROBE_ORDER: TPlatform[] = ["origin", "psn", "xbl"];
const VERBOSE_JSON = process.argv.includes("--verbose-json");

type TVerboseLog = {
  accountId: string;
  uid: string | null;
  ign: string;
  platform: TPlatform;
  stage: "primary" | "fallback";
  reason: string;
  probePlatform?: TPlatform;
  responseUid?: string | null;
  resolvedName?: string | null;
  error?: string;
};

function logVerbose(entry: TVerboseLog): void {
  if (!VERBOSE_JSON) {
    return;
  }
  console.log(`[fix-names:json] ${JSON.stringify(entry)}`);
}

async function run(): Promise<void> {
  dotenv.config({ path: resolve(process.cwd(), "../../.env") });
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing. Ensure apex-assistant/.env exists.");
  }

  const provider = getStatsProvider();
  const result = await pool.query<TRow>(
    `
    select
      id,
      ign,
      platform,
      external_player_id as "externalPlayerId"
    from tracked_accounts
    where is_active = true
      and external_player_id is not null
    order by created_at asc
    `
  );

  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  const reasonCounts: Record<string, number> = {};
  const bump = (reason: string) => {
    reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
  };

  for (const row of result.rows) {
    scanned += 1;
    try {
      const rank = await provider.getRank({
        ign: row.ign,
        platform: row.platform,
        externalPlayerId: row.externalPlayerId
      });
      logVerbose({
        accountId: row.id,
        uid: row.externalPlayerId,
        ign: row.ign,
        platform: row.platform,
        stage: "primary",
        reason: "provider_response",
        probePlatform: row.platform,
        responseUid: rank.externalPlayerId ?? null,
        resolvedName: rank.playerName ?? null
      });

      if (!rank.externalPlayerId) {
        skipped += 1;
        bump("missing_response_uid");
        logVerbose({
          accountId: row.id,
          uid: row.externalPlayerId,
          ign: row.ign,
          platform: row.platform,
          stage: "primary",
          reason: "missing_response_uid",
          probePlatform: row.platform,
          responseUid: rank.externalPlayerId ?? null,
          resolvedName: rank.playerName ?? null
        });
        console.log(`[fix-names] skip missing_response_uid account=${row.id} current="${row.ign}"`);
        continue;
      }
      if (String(rank.externalPlayerId) !== String(row.externalPlayerId)) {
        skipped += 1;
        bump("uid_mismatch");
        logVerbose({
          accountId: row.id,
          uid: row.externalPlayerId,
          ign: row.ign,
          platform: row.platform,
          stage: "primary",
          reason: "uid_mismatch",
          probePlatform: row.platform,
          responseUid: rank.externalPlayerId ?? null,
          resolvedName: rank.playerName ?? null
        });
        console.log(
          `[fix-names] skip uid_mismatch account=${row.id} current="${row.ign}" expected_uid="${row.externalPlayerId}" got_uid="${rank.externalPlayerId}"`
        );
        continue;
      }

      let nextName = rank.playerName?.trim();
      let resolvedPlatform = row.platform;
      if (!nextName) {
        const fallbacks = PLATFORM_PROBE_ORDER.filter((platform) => platform !== row.platform);
        for (const fallbackPlatform of fallbacks) {
          try {
            const fallbackRank = await provider.getRank({
              ign: row.ign,
              platform: fallbackPlatform,
              externalPlayerId: row.externalPlayerId
            });
            logVerbose({
              accountId: row.id,
              uid: row.externalPlayerId,
              ign: row.ign,
              platform: row.platform,
              stage: "fallback",
              reason: "provider_response",
              probePlatform: fallbackPlatform,
              responseUid: fallbackRank.externalPlayerId ?? null,
              resolvedName: fallbackRank.playerName ?? null
            });
            if (String(fallbackRank.externalPlayerId ?? "") !== String(row.externalPlayerId)) {
              logVerbose({
                accountId: row.id,
                uid: row.externalPlayerId,
                ign: row.ign,
                platform: row.platform,
                stage: "fallback",
                reason: "uid_mismatch",
                probePlatform: fallbackPlatform,
                responseUid: fallbackRank.externalPlayerId ?? null,
                resolvedName: fallbackRank.playerName ?? null
              });
              continue;
            }
            const fallbackName = fallbackRank.playerName?.trim();
            if (!fallbackName) {
              logVerbose({
                accountId: row.id,
                uid: row.externalPlayerId,
                ign: row.ign,
                platform: row.platform,
                stage: "fallback",
                reason: "missing_player_name",
                probePlatform: fallbackPlatform,
                responseUid: fallbackRank.externalPlayerId ?? null,
                resolvedName: fallbackRank.playerName ?? null
              });
              continue;
            }
            nextName = fallbackName;
            resolvedPlatform = fallbackPlatform;
            break;
          } catch (fallbackError) {
            const fallbackMessage =
              fallbackError instanceof Error ? fallbackError.message : "Unknown fallback error";
            logVerbose({
              accountId: row.id,
              uid: row.externalPlayerId,
              ign: row.ign,
              platform: row.platform,
              stage: "fallback",
              reason: "provider_error",
              probePlatform: fallbackPlatform,
              error: fallbackMessage
            });
            continue;
          }
        }
      }

      if (!nextName) {
        skipped += 1;
        bump("missing_player_name");
        logVerbose({
          accountId: row.id,
          uid: row.externalPlayerId,
          ign: row.ign,
          platform: row.platform,
          stage: "primary",
          reason: "missing_player_name",
          probePlatform: resolvedPlatform,
          responseUid: rank.externalPlayerId ?? null,
          resolvedName: rank.playerName ?? null
        });
        console.log(`[fix-names] skip missing_player_name account=${row.id} current="${row.ign}"`);
        continue;
      }

      const isSameIgn = nextName.toLowerCase() === row.ign.trim().toLowerCase();
      if (!isSameIgn) {
        const hasCollision = await hasIgnConflictForDifferentExternalId({
          trackedAccountId: row.id,
          ign: nextName,
          externalPlayerId: row.externalPlayerId
        });
        if (hasCollision) {
          skipped += 1;
          bump("name_collision");
          logVerbose({
            accountId: row.id,
            uid: row.externalPlayerId,
            ign: row.ign,
            platform: row.platform,
            stage: "primary",
            reason: "name_collision",
            probePlatform: resolvedPlatform,
            responseUid: rank.externalPlayerId ?? null,
            resolvedName: nextName
          });
          console.log(
            `[fix-names] skip name_collision account=${row.id} current="${row.ign}" next="${nextName}" uid="${row.externalPlayerId}"`
          );
          continue;
        }
      }
      const didUpdate = await updateTrackedAccountIgnById({
        trackedAccountId: row.id,
        ign: nextName
      });
      if (didUpdate) {
        updated += 1;
        bump("updated");
        logVerbose({
          accountId: row.id,
          uid: row.externalPlayerId,
          ign: row.ign,
          platform: row.platform,
          stage: "primary",
          reason: "updated",
          probePlatform: resolvedPlatform,
          responseUid: rank.externalPlayerId ?? null,
          resolvedName: nextName
        });
        console.log(
          `[fix-names] updated account=${row.id} "${row.ign}" -> "${nextName}" platform_probe="${resolvedPlatform}"`
        );
      } else {
        skipped += 1;
        bump("update_blocked");
        logVerbose({
          accountId: row.id,
          uid: row.externalPlayerId,
          ign: row.ign,
          platform: row.platform,
          stage: "primary",
          reason: "update_blocked",
          probePlatform: resolvedPlatform,
          responseUid: rank.externalPlayerId ?? null,
          resolvedName: nextName
        });
        console.log(`[fix-names] skip update_blocked account=${row.id} current="${row.ign}" next="${nextName}"`);
      }
    } catch (error) {
      failed += 1;
      bump("failed");
      const message = error instanceof Error ? error.message : "Unknown error";
      logVerbose({
        accountId: row.id,
        uid: row.externalPlayerId,
        ign: row.ign,
        platform: row.platform,
        stage: "primary",
        reason: "provider_error",
        probePlatform: row.platform,
        error: message
      });
      console.error(`[fix-names] failed account=${row.id} ign="${row.ign}" error="${message}"`);
    }
  }

  console.log(
    `[fix-names] complete scanned=${scanned} updated=${updated} skipped=${skipped} failed=${failed} reasons=${JSON.stringify(reasonCounts)}`
  );
  await pool.end();
}

run().catch((error: unknown) => {
  console.error("Fix tracked account names failed:", error);
  process.exit(1);
});
