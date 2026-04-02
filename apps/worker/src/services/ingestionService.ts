import { AppError, getStatsProvider, type TTrackedAccount } from "@apex-assistant/core";
import {
  autoLinkTrackedAccountByExactFingerprint,
  claimNextDueTrackedAccount,
  hasIgnConflictForDifferentExternalId,
  insertPlayerStatsSnapshot,
  insertRankSnapshot,
  listTrackedAccountsByGuild,
  releaseTrackedAccountClaim,
  updateTrackedAccountIgnIfChanged,
  updateTrackedAccountCurrentRank,
  updateTrackedAccountLiveStats,
  updateTrackedAccountLastCheckedAt,
  upsertMatch
} from "@apex-assistant/db";
import { fetchRecentMatches } from "../providers/matchClient.js";

const statsProvider = getStatsProvider();

function hasMatchProviderConfig(): boolean {
  return Boolean(process.env.MATCH_API_BASE_URL && process.env.MATCH_API_KEY);
}

type TIngestionHealth = {
  provider: string;
  success: number;
  failures: number;
  lastError: string | null;
  lastRunAt: string | null;
};

const providerHealth = new Map<string, TIngestionHealth>();

function recordProviderHealth(provider: string, success: boolean, errorMessage?: string): void {
  const current = providerHealth.get(provider) ?? {
    provider,
    success: 0,
    failures: 0,
    lastError: null,
    lastRunAt: null
  };
  if (success) {
    current.success += 1;
  } else {
    current.failures += 1;
    current.lastError = errorMessage ?? "Unknown error";
  }
  current.lastRunAt = new Date().toISOString();
  providerHealth.set(provider, current);
}

export function getProviderHealth(): TIngestionHealth[] {
  return [...providerHealth.values()];
}

export async function ingestGuild(guildId: string): Promise<{ processed: number; failed: number }> {
  const tracked = await listTrackedAccountsByGuild(guildId);
  let processed = 0;
  let failed = 0;

  for (const account of tracked) {
    try {
      await ingestTrackedAccount(account);
      processed += 1;
    } catch {
      failed += 1;
    }
  }

  return { processed, failed };
}

export async function ingestTrackedAccount(account: TTrackedAccount): Promise<void> {
  const startedAt = Date.now();
  try {
    const rank = await statsProvider.getRank({
      ign: account.ign,
      platform: account.platform,
      externalPlayerId: account.externalPlayerId
    });
    const canRenameFromProfile =
      Boolean(account.externalPlayerId) &&
      Boolean(rank.externalPlayerId) &&
      String(account.externalPlayerId) === String(rank.externalPlayerId);

    if (canRenameFromProfile && rank.playerName && rank.playerName.trim()) {
      const nextIgn = rank.playerName.trim();
      const isSameIgn = nextIgn.toLowerCase() === account.ign.trim().toLowerCase();
      if (!isSameIgn) {
        const hasCollision = await hasIgnConflictForDifferentExternalId({
          trackedAccountId: account.id,
          ign: nextIgn,
          externalPlayerId: account.externalPlayerId
        });
        if (hasCollision) {
          console.warn(
            `[worker] player rename skipped due to name collision account=${account.id} current="${account.ign}" next="${nextIgn}" external_player_id="${account.externalPlayerId}"`
          );
        } else {
          const didUpdateIgn = await updateTrackedAccountIgnIfChanged({
            trackedAccountId: account.id,
            ign: nextIgn
          });
          if (didUpdateIgn) {
            console.log(`[worker] player rename detected account=${account.id} old="${account.ign}" new="${nextIgn}"`);
          }
        }
      } else {
        await updateTrackedAccountIgnIfChanged({
          trackedAccountId: account.id,
          ign: nextIgn
        });
      }
    }
    await insertRankSnapshot({
      trackedAccountId: account.id,
      rankScore: rank.rankScore,
      rankName: rank.rankName,
      rankDivision: rank.rankDivision,
      iconUrl: rank.iconUrl,
      source: statsProvider.name
    });
    await updateTrackedAccountCurrentRank({
      trackedAccountId: account.id,
      rankName: rank.rankName ?? null,
      rankDivision: rank.rankDivision ?? null,
      iconUrl: rank.iconUrl ?? null
    });
    await insertPlayerStatsSnapshot({
      trackedAccountId: account.id,
      currentLevel: rank.currentLevel ?? null,
      careerKills: rank.careerKills ?? null,
      careerDamage: rank.careerDamage ?? null,
      careerWins: rank.careerWins ?? null
    });
    await updateTrackedAccountLiveStats({
      trackedAccountId: account.id,
      currentLevel: rank.currentLevel ?? null,
      careerKills: rank.careerKills ?? null,
      careerDamage: rank.careerDamage ?? null,
      careerWins: rank.careerWins ?? null,
      realtime: rank.realtime ?? null
    });
    await autoLinkTrackedAccountByExactFingerprint({
      trackedAccountId: account.id,
      actorUserId: account.ownerUserId
    });
    await updateTrackedAccountLastCheckedAt(account.id);
    recordProviderHealth(statsProvider.name, true);

    if (hasMatchProviderConfig()) {
      try {
        const matches = await fetchRecentMatches({ ign: account.ign, platform: account.platform });
        for (const match of matches) {
          await upsertMatch({
            trackedAccountId: account.id,
            providerMatchId: match.id,
            playedAt: new Date(match.playedAt),
            mode: match.mode,
            placement: match.placement,
            kills: match.kills,
            assists: match.assists,
            knocks: match.knocks,
            damage: match.damage,
            survivalTimeSec: match.survivalTimeSec,
            rawPayload: match.rawPayload
          });
        }
        recordProviderHealth("match_api", true);
      } catch (error) {
        recordProviderHealth("match_api", false, error instanceof Error ? error.message : "Failed to fetch match details.");
      }
    }
    console.log(
      `[worker] player sync ok guild=${account.guildId} account=${account.id} player=${account.ign} platform=${account.platform} source=${statsProvider.name} elapsed_ms=${Date.now() - startedAt}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(
      `[worker] player sync failed guild=${account.guildId} account=${account.id} player=${account.ign} platform=${account.platform} source=${statsProvider.name} elapsed_ms=${Date.now() - startedAt} error="${message}"`
    );
    recordProviderHealth(
      error instanceof AppError && (error.code.includes("TRN") || error.code.includes("APEX_API"))
        ? statsProvider.name
        : "match_api",
      false,
      message
    );
    throw error;
  }
}

export async function ingestNextDueTrackedAccount(params: {
  pollMinutes: number;
  onlinePollMinutes?: number;
  leaseSeconds: number;
  workerId: string;
  guildId?: string;
}): Promise<{ processed: boolean; accountId?: string; failed?: boolean }> {
  const account = await claimNextDueTrackedAccount({
    pollMinutes: params.pollMinutes,
    onlinePollMinutes: params.onlinePollMinutes,
    leaseSeconds: params.leaseSeconds,
    workerId: params.workerId,
    guildId: params.guildId
  });
  if (!account) {
    return { processed: false };
  }

  try {
    await ingestTrackedAccount(account);
    return { processed: true, accountId: account.id, failed: false };
  } catch {
    return { processed: true, accountId: account.id, failed: true };
  } finally {
    await releaseTrackedAccountClaim(account.id, params.workerId);
  }
}
