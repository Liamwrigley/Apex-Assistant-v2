import {
  derivePresenceFromRealtimeFields,
  fetchApexProfileForIngest,
  getStatsProvider,
  toRealtimePresenceFieldsFromRankRealtime,
  toRealtimePresenceFieldsFromTrackedAccount,
  type TTrackedAccount
} from "@apex-assistant/core";
import {
  cacheInvalidate,
  CacheKeys,
  playerInvalidationKeys,
} from "@apex-assistant/cache";
import {
  autoLinkTrackedAccountByExactFingerprint,
  claimNextDueTrackedAccount,
  getLatestRankScoreForAccount,
  hasIgnConflictForDifferentExternalId,
  insertPlayerStatsSnapshot,
  insertRankSnapshot,
  insertTrackerObservationsBatch,
  insertPresenceSnapshotIfChanged,
  listTrackedAccountsByGuild,
  releaseTrackedAccountClaim,
  syncPlaySessionIngest,
  updateTrackedAccountIgnIfChanged,
  updateTrackedAccountCurrentRank,
  updateTrackedAccountLiveStats,
  updateTrackedAccountLastCheckedAt
} from "@apex-assistant/db";
import { syncGameSegment } from "./gameSegmentService.js";
import { getRankedMap } from "./mapRotationService.js";

const statsProvider = getStatsProvider();

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
    const profile = await fetchApexProfileForIngest({
      ign: account.ign,
      platform: account.platform,
      externalPlayerId: account.externalPlayerId
    });
    const rank = profile.rank;
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
    const previousScore = await getLatestRankScoreForAccount(account.id);
    const scoreChanged = previousScore !== null && previousScore !== rank.rankScore;

    let mapForSnapshot: { rankedMapCode: string; rankedMapName: string } | undefined;
    if (scoreChanged) {
      const mapInfo = await getRankedMap();
      if (mapInfo) {
        mapForSnapshot = { rankedMapCode: mapInfo.mapCode, rankedMapName: mapInfo.mapName };
      }
    }

    await insertRankSnapshot({
      trackedAccountId: account.id,
      rankScore: rank.rankScore,
      rankName: rank.rankName,
      rankDivision: rank.rankDivision,
      iconUrl: rank.iconUrl,
      source: statsProvider.name,
      ...mapForSnapshot
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
    const prevPresence = derivePresenceFromRealtimeFields(toRealtimePresenceFieldsFromTrackedAccount(account));
    const nextPresence = derivePresenceFromRealtimeFields(toRealtimePresenceFieldsFromRankRealtime(rank.realtime));
    const sessionResult = await syncPlaySessionIngest({
      trackedAccountId: account.id,
      prevActive: prevPresence.shouldShow,
      nextActive: nextPresence.shouldShow,
      nextStatus: nextPresence.status,
      rankScore: rank.rankScore,
      rankName: rank.rankName ?? null,
      rankDivision: rank.rankDivision ?? null,
      rankIconUrl: rank.iconUrl ?? null,
      selectedLegend: rank.realtime?.selectedLegend ?? null
    });
    const presenceSnapshot = await insertPresenceSnapshotIfChanged({
      trackedAccountId: account.id,
      selectedLegend: rank.realtime?.selectedLegend ?? null,
      isInGame: nextPresence.status === "in_game",
      lobbyState: rank.realtime?.lobbyState ?? null,
      currentState: rank.realtime?.currentState ?? null,
      currentStateAsText: rank.realtime?.currentStateAsText ?? null,
      derivedStatus: nextPresence.status
    });
    await syncGameSegment({
      trackedAccountId: account.id,
      nextPresenceStatus: nextPresence.status,
      nextActive: nextPresence.shouldShow,
      rankScore: rank.rankScore,
      selectedLegend: rank.realtime?.selectedLegend ?? null,
      rankName: rank.rankName,
      rankDivision: rank.rankDivision ?? null,
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
    const pollAt = new Date();
    await insertTrackerObservationsBatch({
      trackedAccountId: account.id,
      capturedAt: pollAt,
      selectedLegendAtPoll: rank.realtime?.selectedLegend ?? null,
      rows: profile.trackerObservations.map((o) => ({
        legendName: o.legendName,
        trackerKey: o.trackerKey,
        displayName: o.displayName,
        value: o.value,
        globalFlag: o.globalFlag,
        dataIndex: o.dataIndex,
        source: o.source
      }))
    });
    await autoLinkTrackedAccountByExactFingerprint({
      trackedAccountId: account.id,
      actorUserId: account.ownerUserId
    });
    await updateTrackedAccountLastCheckedAt(account.id);

    const presenceChanged = presenceSnapshot !== null;
    const sessionChanged = sessionResult.sessionChanged;
    const anythingChanged = scoreChanged || presenceChanged || sessionChanged;

    if (anythingChanged) {
      const keysToInvalidate: string[] = [
        CacheKeys.dashboardLive(account.guildId),
        CacheKeys.tracked(account.guildId),
      ];

      if (scoreChanged) {
        keysToInvalidate.push(
          CacheKeys.leaderboard(account.guildId),
          CacheKeys.lbTimelines(account.guildId),
          CacheKeys.stats24h(account.guildId),
          CacheKeys.dashboardStatic(account.guildId),
          ...playerInvalidationKeys(account.id),
        );
      }

      if (sessionChanged) {
        keysToInvalidate.push(CacheKeys.dashboardStatic(account.guildId));
      }

      await cacheInvalidate(...keysToInvalidate);
    }

    recordProviderHealth(statsProvider.name, true);
    console.log(
      `[worker] player sync ok guild=${account.guildId} account=${account.id} player=${account.ign} platform=${account.platform} source=${statsProvider.name} elapsed_ms=${Date.now() - startedAt} cache_invalidated=${anythingChanged}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(
      `[worker] player sync failed guild=${account.guildId} account=${account.id} player=${account.ign} platform=${account.platform} source=${statsProvider.name} elapsed_ms=${Date.now() - startedAt} error="${message}"`
    );
    recordProviderHealth(statsProvider.name, false, message);
    throw error;
  }
}

export async function ingestNextDueTrackedAccount(params: {
  pollMinutes: number;
  onlinePollSeconds?: number;
  leaseSeconds: number;
  workerId: string;
  guildId?: string;
}): Promise<{ processed: boolean; accountId?: string; failed?: boolean }> {
  const account = await claimNextDueTrackedAccount({
    pollMinutes: params.pollMinutes,
    onlinePollSeconds: params.onlinePollSeconds,
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
