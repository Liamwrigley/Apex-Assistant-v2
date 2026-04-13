export type TSegmentTrackerDelta = {
  displayName: string;
  trackerKey: string;
  dataIndex: number;
  delta: number | null;
  endValue: number;
};

export type TSegmentRow = {
  legendAssumed: string | null;
  rpDelta: number | null;
  confidence: string;
  mergeRisk: boolean;
  startedAt: string;
  endedAt: string | null;
  rankedMapNameOpen: string | null;
  rankedMapNameClose: string | null;
  openingCareerKills: number | null;
  closingCareerKills: number | null;
  openingCareerDamage: number | null;
  closingCareerDamage: number | null;
  trackerDeltas?: TSegmentTrackerDelta[];
};
