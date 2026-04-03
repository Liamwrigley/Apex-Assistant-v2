import type { TTrackedAccount } from "./types.js";

/** Subset of stats-provider realtime payload (avoids importing statsProvider here). */
export type TRankRealtimePayload = {
  isOnline?: number | null;
  isInGame?: number | null;
  currentState?: string | null;
  currentStateAsText?: string | null;
} | null | undefined;

export type TRealtimePresenceFields = {
  realtimeIsOnline: number | null;
  realtimeIsInGame: number | null;
  realtimeCurrentState: string | null;
  realtimeCurrentStateAsText: string | null;
};

export type TDerivedPresenceStatus = "offline" | "online" | "in_game" | "unknown";

/** Result of applying the same rules as the dashboard, without any freshness / age check. */
export type TDerivedPresence = {
  status: TDerivedPresenceStatus;
  /** True when this player would appear in Live Presence if realtime were considered fresh. */
  shouldShow: boolean;
};

function includesAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

/**
 * Core presence rules shared by the web dashboard (after freshness) and the worker session FSM (no freshness).
 */
export function derivePresenceFromRealtimeFields(
  input: TRealtimePresenceFields
): TDerivedPresence {
  const stateText = `${input.realtimeCurrentStateAsText ?? ""} ${input.realtimeCurrentState ?? ""}`
    .trim()
    .toLowerCase();
  const isInGameFlag = input.realtimeIsInGame === 1;
  const isOnlineFlag = input.realtimeIsOnline === 1;

  if (isOnlineFlag && isInGameFlag) {
    return { status: "in_game", shouldShow: true };
  }

  if (isOnlineFlag) {
    return { status: "online", shouldShow: true };
  }

  const stateSuggestsOffline = includesAny(stateText, ["offline", "afk", "disconnected", "not online"]);
  if (!isOnlineFlag && stateSuggestsOffline) {
    return { status: "offline", shouldShow: false };
  }

  const stateSuggestsInGame = includesAny(stateText, ["in game", "match", "firing range", "ingame"]);
  if (stateSuggestsInGame) {
    return { status: "in_game", shouldShow: true };
  }

  if (isInGameFlag && !isOnlineFlag) {
    return { status: "offline", shouldShow: false };
  }

  return { status: "offline", shouldShow: false };
}

export function toRealtimePresenceFieldsFromTrackedAccount(
  account: Pick<
    TTrackedAccount,
    | "realtimeIsOnline"
    | "realtimeIsInGame"
    | "realtimeCurrentState"
    | "realtimeCurrentStateAsText"
  >
): TRealtimePresenceFields {
  return {
    realtimeIsOnline: account.realtimeIsOnline,
    realtimeIsInGame: account.realtimeIsInGame,
    realtimeCurrentState: account.realtimeCurrentState,
    realtimeCurrentStateAsText: account.realtimeCurrentStateAsText
  };
}

export function toRealtimePresenceFieldsFromRankRealtime(
  realtime: TRankRealtimePayload
): TRealtimePresenceFields {
  return {
    realtimeIsOnline: realtime?.isOnline ?? null,
    realtimeIsInGame: realtime?.isInGame ?? null,
    realtimeCurrentState: realtime?.currentState ?? null,
    realtimeCurrentStateAsText: realtime?.currentStateAsText ?? null
  };
}
