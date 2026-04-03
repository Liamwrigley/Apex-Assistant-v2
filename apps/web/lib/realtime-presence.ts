import {
  type TDerivedPresenceStatus,
  derivePresenceFromRealtimeFields,
  type TRealtimePresenceFields,
} from "@apex-assistant/core";

export type TRealtimePresenceInput = TRealtimePresenceFields & {
  realtimeUpdatedAt: string | null;
};

export type { TDerivedPresenceStatus };

export type TPresenceEvaluation = {
  isFresh: boolean;
  ageMs: number | null;
  status: TDerivedPresenceStatus;
  shouldShow: boolean;
  reason: string;
};

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

  const derived = derivePresenceFromRealtimeFields({
    realtimeIsOnline: input.realtimeIsOnline,
    realtimeIsInGame: input.realtimeIsInGame,
    realtimeCurrentState: input.realtimeCurrentState,
    realtimeCurrentStateAsText: input.realtimeCurrentStateAsText
  });

  const reasonFromDerived = (): string => {
    if (derived.shouldShow && derived.status === "in_game") {
      return "derived_in_game";
    }
    if (derived.shouldShow) {
      return "derived_online";
    }
    if (derived.status === "offline") {
      return "derived_offline";
    }
    return "derived_unknown";
  };

  return {
    isFresh: true,
    ageMs,
    status: derived.status,
    shouldShow: derived.shouldShow,
    reason: reasonFromDerived()
  };
}
