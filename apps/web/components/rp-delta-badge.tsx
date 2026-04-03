import { cn } from "@/lib/utils";

export function computeRankScoreDelta(
  opening: number | null,
  latest: number | null
): number | null {
  if (opening === null || latest === null) {
    return null;
  }
  const d = latest - opening;
  return Number.isFinite(d) ? d : null;
}

/** Matches leaderboard 24h delta styling (pill, arrows, +/−, locale number — no “ RP” suffix). */
export function RpDeltaBadge(props: {
  delta: number | null | undefined;
  /** When delta is not a finite number */
  empty?: "dash" | "hidden";
  className?: string;
}) {
  const empty = props.empty ?? "dash";
  if (typeof props.delta !== "number" || !Number.isFinite(props.delta)) {
    if (empty === "hidden") {
      return null;
    }
    return (
      <span className={cn("text-muted-foreground", props.className)}>—</span>
    );
  }
  const d = props.delta;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs tabular-nums",
        d > 0
          ? "bg-emerald-500/15 text-emerald-300"
          : d < 0
            ? "bg-rose-500/15 text-rose-300"
            : "text-muted-foreground",
        props.className
      )}
    >
      {d > 0 ? (
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-3.5 w-3.5 shrink-0">
          <path d="M10 3l5 6h-3v8H8V9H5l5-6z" />
        </svg>
      ) : null}
      {d < 0 ? (
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-3.5 w-3.5 shrink-0">
          <path d="M10 17l-5-6h3V3h4v8h3l-5 6z" />
        </svg>
      ) : null}
      <span>
        {d > 0 ? "+" : ""}
        {d.toLocaleString()}
      </span>
    </span>
  );
}
