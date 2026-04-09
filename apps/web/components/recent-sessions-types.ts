export type TEstimatedGame = {
  legend: string | null;
  rpDelta: number | null;
  confidence: string;
  mergeRisk: boolean;
  deltaKills?: number | null;
  deltaDamage?: number | null;
  startedAt?: string | null;
  endedAt?: string | null;
  rankedMapNameOpen?: string | null;
  rankedMapNameClose?: string | null;
  openingCareerKills?: number | null;
  closingCareerKills?: number | null;
  openingCareerDamage?: number | null;
  closingCareerDamage?: number | null;
};

export type TRecentSessionRow = {
  sessionId: string;
  trackedAccountId?: string;
  ign: string;
  platform: string;
  startedAt: string;
  /** `null` while the play session is still open (in progress). */
  endedAt: string | null;
  /** Open session on the dashboard / profile — show live styling. */
  isActiveSession?: boolean;
  openingRankScore: number | null;
  latestRankScore: number | null;
  openingRankName: string | null;
  openingRankDivision: string | null;
  openingRankIconUrl: string | null;
  latestRankName: string | null;
  latestRankDivision: string | null;
  latestRankIconUrl: string | null;
  legends: string[];
  /** Rank snapshots within the session window (plus open/close fallback). */
  rankSparklinePoints: Array<{ capturedAt: string; rankScore: number }>;
  estimatedGames?: TEstimatedGame[];
};
