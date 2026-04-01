export type TPlatform = "origin" | "psn" | "xbl";

export type TRankSnapshot = {
  id: string;
  trackedAccountId: string;
  capturedAt: Date;
  rankScore: number;
  rankName: string;
  rankDivision: string | null;
  iconUrl: string | null;
  source: "trn";
};

export type TTrackedAccount = {
  id: string;
  guildId: string;
  ownerUserId: string;
  ownerDisplayName?: string | null;
  ign: string;
  platform: TPlatform;
  externalPlayerId: string | null;
  externalSource: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastCheckedAt: Date | null;
  currentLevel: number | null;
  realtimeLobbyState: string | null;
  realtimeIsOnline: number | null;
  realtimeIsInGame: number | null;
  realtimeCanJoin: number | null;
  realtimePartyFull: number | null;
  realtimeSelectedLegend: string | null;
  realtimeCurrentState: string | null;
  realtimeCurrentStateAsText: string | null;
  realtimeCurrentStateSinceTimestamp: number | null;
  realtimeUpdatedAt: Date | null;
};

export type TPlayerStatSnapshot = {
  id: string;
  trackedAccountId: string;
  capturedAt: Date;
  currentLevel: number | null;
  careerKills: number | null;
  careerDamage: number | null;
  careerWins: number | null;
};

export type TMatch = {
  id: string;
  trackedAccountId: string;
  provider: "match_api";
  providerMatchId: string;
  playedAt: Date;
  mode: string | null;
  placement: number | null;
  kills: number | null;
  assists: number | null;
  knocks: number | null;
  damage: number | null;
  survivalTimeSec: number | null;
  rawPayload: Record<string, unknown>;
};

export type TTrackRequest = {
  guildId: string;
  requesterUserId: string;
  ign: string;
  platform: TPlatform;
};

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  public constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}
