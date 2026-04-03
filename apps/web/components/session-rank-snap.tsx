import { cn } from "@/lib/utils";

export type TSessionRankSnap = {
  rankScore: number | null;
  rankName: string | null;
  rankDivision: string | null;
  iconUrl: string | null;
};

/** Rank tier + RP for session start/end (matches leaderboard rank cell style). */
export function SessionRankSnap(props: {
  /** Optional; omit when the table column header is enough. */
  label?: string;
  snap: TSessionRankSnap;
  compact?: boolean;
}) {
  const { snap, label, compact } = props;
  const showLabel = Boolean(label?.trim());
  const hasAny =
    snap.rankScore !== null || Boolean(snap.rankName?.trim()) || Boolean(snap.iconUrl);
  if (!hasAny) {
    return (
      <div>
        {showLabel ? (
          <div className="text-muted-foreground mb-0.5 text-[10px] font-medium tracking-wide uppercase">
            {label}
          </div>
        ) : null}
        <span className="text-muted-foreground text-xs">—</span>
      </div>
    );
  }
  const tierLine = [snap.rankName?.trim(), snap.rankDivision?.trim()]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="min-w-0">
      {showLabel ? (
        <div className="text-muted-foreground mb-0.5 text-[10px] font-medium tracking-wide uppercase">
          {label}
        </div>
      ) : null}
      <div className={cn("flex items-start gap-2", compact && "gap-1.5")}>
        {snap.iconUrl ? (
          <img
            src={snap.iconUrl}
            alt=""
            className={cn(
              "mt-0.5 shrink-0 object-contain",
              compact ? "h-6 w-6" : "h-8 w-8"
            )}
          />
        ) : (
          <div
            className={cn("mt-0.5 shrink-0 rounded bg-muted", compact ? "h-6 w-6" : "h-8 w-8")}
            aria-hidden
          />
        )}
        <div className="min-w-0 leading-tight">
          {tierLine ? (
            <div className="truncate text-xs font-medium">{tierLine}</div>
          ) : (
            <div className="text-muted-foreground text-xs">Rank</div>
          )}
          <div className="text-muted-foreground tabular-nums text-xs">
            {snap.rankScore !== null ? `${snap.rankScore.toLocaleString()} RP` : "—"}
          </div>
        </div>
      </div>
    </div>
  );
}
