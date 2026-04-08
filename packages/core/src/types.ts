export type TPlatform = "origin" | "psn" | "xbl";

export type TRankSnapshot = {
  id: string;
  trackedAccountId: string;
  capturedAt: Date;
  rankScore: number;
  rankName: string;
  rankDivision: string | null;
  iconUrl: string | null;
  source: string;
  rankedMapCode: string | null;
  rankedMapName: string | null;
};

export type TTrackedAccount = {
  id: string;
  guildId: string;
  ownerUserId: string;
  ownerDisplayName?: string | null;
  identityGroupId: string | null;
  ign: string;
  platform: TPlatform;
  externalPlayerId: string | null;
  externalSource: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastCheckedAt: Date | null;
  currentLevel: number | null;
  /** Latest BR rank tier name from provider (e.g. "Bronze"). */
  currentRankName: string | null;
  /** Latest BR rank division from provider (e.g. "4" for Bronze IV). */
  currentRankDivision: string | null;
  /** Latest rank tier icon URL from provider (e.g. mozambiquehe.re rank asset). */
  currentRankIconUrl: string | null;
  careerKills: number | null;
  careerDamage: number | null;
  careerWins: number | null;
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
