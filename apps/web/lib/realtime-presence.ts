export type TRealtimePresenceInput = {
  realtimeUpdatedAt: string | null;
  realtimeIsOnline: number | null;
  realtimeIsInGame: number | null;
  realtimeCurrentState: string | null;
  realtimeCurrentStateAsText: string | null;
};

export type TDerivedPresenceStatus = "offline" | "online" | "in_game" | "unknown";

export type TPresenceEvaluation = {
  isFresh: boolean;
  ageMs: number | null;
  status: TDerivedPresenceStatus;
  shouldShow: boolean;
  reason: string;
};

function includesAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

export function evaluateRealtimePresence(
  input: TRealtimePresenceInput,
  maxAgeMinutes = 15
): TPresenceEvaluation {
  if (!input.realtimeUpdatedAt) {
    return {
      isFresh: false,
      ageMs: null,
      status: "unknown",
      shouldShow: false,
      reason: "missing_realtime_updated_at"
    };
  }

  const ageMs = Date.now() - new Date(input.realtimeUpdatedAt).getTime();
  const isFresh = Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= maxAgeMinutes * 60_000;
  if (!isFresh) {
    return {
      isFresh: false,
      ageMs: Number.isFinite(ageMs) ? ageMs : null,
      status: "unknown",
      shouldShow: false,
      reason: "stale_realtime"
    };
  }

  const stateText = `${input.realtimeCurrentStateAsText ?? ""} ${input.realtimeCurrentState ?? ""}`
    .trim()
    .toLowerCase();
  const isInGameFlag = input.realtimeIsInGame === 1;
  const isOnlineFlag = input.realtimeIsOnline === 1;

  // Online flag is the primary signal.
  if (isOnlineFlag && isInGameFlag) {
    return {
      isFresh: true,
      ageMs,
      status: "in_game",
      shouldShow: true,
      reason: "online_and_in_game_flags"
    };
  }

  if (isOnlineFlag) {
    return {
      isFresh: true,
      ageMs,
      status: "online",
      shouldShow: true,
      reason: "is_online_flag"
    };
  }

  const stateSuggestsOffline = includesAny(stateText, ["offline", "afk", "disconnected", "not online"]);
  if (!isOnlineFlag && stateSuggestsOffline) {
    return {
      isFresh: true,
      ageMs,
      status: "offline",
      shouldShow: false,
      reason: "state_text_offline"
    };
  }

  const stateSuggestsInGame = includesAny(stateText, ["in game", "match", "firing range", "ingame"]);
  if (stateSuggestsInGame) {
    return {
      isFresh: true,
      ageMs,
      status: "in_game",
      shouldShow: true,
      reason: "state_text_in_game"
    };
  }

  // In-game without online is treated as provider inconsistency; hide.
  if (isInGameFlag && !isOnlineFlag) {
    return {
      isFresh: true,
      ageMs,
      status: "offline",
      shouldShow: false,
      reason: "in_game_without_online_flag"
    };
  }

  return {
    isFresh: true,
    ageMs,
    status: "offline",
    shouldShow: false,
    reason: "all_presence_flags_negative"
  };
}

