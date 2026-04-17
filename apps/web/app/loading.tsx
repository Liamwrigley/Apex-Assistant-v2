import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

function SkeletonBar(props: { className?: string }) {
  return (
    <div
      className={cn("bg-muted/70 animate-pulse rounded-md", props.className)}
      aria-hidden
    />
  );
}

/** Mini stat tile matching dashboard summary cards (icon + label + value lines). */
function StatTileSkeleton(props: { borderClass: string; tintClass: string }) {
  return (
    <Card className={props.borderClass}>
      <CardHeader className="space-y-1 p-2.5">
        <div
          className={cn(
            "inline-flex h-5 w-5 items-center justify-center rounded-sm",
            props.tintClass,
          )}
        >
          <SkeletonBar className="h-3 w-3 rounded-sm opacity-60" />
        </div>
        <SkeletonBar className="h-2.5 w-20" />
        <div className="min-w-0 space-y-0.5">
          <SkeletonBar className="h-6 w-16" />
          <SkeletonBar className="h-3 w-12 opacity-70" />
        </div>
      </CardHeader>
    </Card>
  );
}

export default function HomeLoading() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      {/* Top summary — matches `grid gap-3 md:grid-cols-5` + tinted borders */}
      <section className="grid gap-3 md:grid-cols-5">
        <StatTileSkeleton
          borderClass="border-emerald-500/20 bg-emerald-500/5"
          tintClass="bg-emerald-500/15"
        />
        <StatTileSkeleton
          borderClass="border-cyan-500/20 bg-cyan-500/5"
          tintClass="bg-cyan-500/15"
        />
        <StatTileSkeleton
          borderClass="border-amber-500/20 bg-amber-500/5"
          tintClass="bg-amber-500/15"
        />
        <StatTileSkeleton
          borderClass="border-emerald-500/20 bg-emerald-500/5"
          tintClass="bg-emerald-500/15"
        />
        <StatTileSkeleton
          borderClass="border-rose-500/20 bg-rose-500/5"
          tintClass="bg-rose-500/15"
        />
      </section>

      {/* LeaderboardCard — title row + view toggle + wide table. Matches the
          real leaderboard-table structure (default sparkline view) so col widths
          don't jump when the data loads. */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Leaderboard</CardTitle>
            <CardDescription>
              Latest rank snapshot by tracked account.
            </CardDescription>
          </div>
          {/* Two toggles: RP delta window (24h/7d/30d) + view mode (Sparkline/Matches).
              Sizes are tuned so the skeleton visually lines up with the real toggles
              and the header doesn't shift width on hydration. */}
          <div className="flex shrink-0 items-center gap-2">
            <SkeletonBar className="h-7 w-[130px] rounded-md" />
            <SkeletonBar className="h-7 w-[152px] rounded-md" />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-xs">
                <th className="whitespace-nowrap px-2 py-2 font-medium">Player</th>
                <th className="whitespace-nowrap px-2 py-2 font-medium">Rank</th>
                <th className="w-[110px] min-w-[110px] whitespace-nowrap px-2 py-2 text-right font-medium">
                  24h Delta
                </th>
                <th className="w-full px-2 py-2 text-center font-medium">7d Trend</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }).map((_, i) => (
                <tr
                  key={i}
                  className="border-border/60 border-b last:border-0"
                >
                  <td className="px-2 py-2 align-middle">
                    {/* Matches the real Player cell: IGN (text-sm) + muted Discord name (text-[11px])
                        stacked with leading-tight and a subtle gap so the two rows don't touch. */}
                    <div className="flex min-w-0 flex-col gap-0.5 leading-tight">
                      <SkeletonBar className="h-4 w-28" />
                      <SkeletonBar className="h-3 w-20" />
                    </div>
                  </td>
                  <td className="px-2 py-2 align-middle">
                    <div className="flex items-start gap-2">
                      <SkeletonBar className="mt-0.5 h-8 w-8 shrink-0 rounded-sm" />
                      <div className="min-w-0 flex-1 space-y-1">
                        <SkeletonBar className="h-4 w-20" />
                        <SkeletonBar className="h-3 w-14" />
                      </div>
                    </div>
                  </td>
                  <td className="w-[110px] min-w-[110px] whitespace-nowrap px-2 py-2 text-right align-middle">
                    <SkeletonBar className="ml-auto h-5 w-20" />
                  </td>
                  <td className="w-full overflow-visible px-2 py-2 align-middle">
                    <div className="flex min-h-[74px] items-center justify-start overflow-visible">
                      <SkeletonBar className="h-[58px] w-full max-w-[640px] rounded-md" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* RecentSessionsSection */}
      <Card>
        <CardHeader>
          <CardTitle>Session history</CardTitle>
          <CardDescription>
            In-progress sessions appear at the top with a live indicator.
            Completed sessions show rank at start vs end, RP change, and legends
            while active. Click a row for details.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="scrollbar-app w-full overflow-x-auto">
            <table className="min-w-[900px] w-full text-left text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-xs">
                  {[
                    "Player",
                    "Start",
                    "End",
                    "RP Δ",
                    "Legends",
                    "Est. games",
                    "Duration",
                    "Finished",
                  ].map((label) => (
                    <th key={label} className="px-2 py-2 font-medium">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr
                    key={i}
                    className="border-border/60 border-b last:border-0"
                  >
                    <td className="px-2 py-2 align-top">
                      <div className="flex items-start gap-2">
                        <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-muted/60" />
                        <div className="min-w-0 space-y-1.5">
                          <SkeletonBar className="h-4 w-28" />
                          <SkeletonBar className="h-3 w-8" />
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2 align-top">
                      <SkeletonBar className="h-10 w-[88px]" />
                    </td>
                    <td className="px-2 py-2 align-top">
                      <SkeletonBar className="h-10 w-[88px]" />
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <SkeletonBar className="h-6 w-16" />
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <div className="flex gap-1">
                        <SkeletonBar className="h-5 w-5 rounded-sm" />
                        <SkeletonBar className="h-5 w-5 rounded-sm" />
                      </div>
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <SkeletonBar className="h-4 w-8" />
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <SkeletonBar className="h-4 w-14" />
                    </td>
                    <td className="px-2 py-2 text-right align-middle">
                      <SkeletonBar className="ml-auto h-3 w-20" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Tracked Accounts — owner block + table */}
      <Card>
        <CardHeader>
          <CardTitle>Tracked Accounts</CardTitle>
          <CardDescription>
            Grouped by owner with tracking and sync timestamps.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="border-border/60 overflow-x-auto rounded-lg border">
              <div className="border-border/60 border-b bg-muted/40 px-3 py-2">
                <SkeletonBar className="h-4 w-36" />
              </div>
              <div className="p-3">
                <table className="min-w-[900px] w-full table-fixed text-left text-sm">
                  <thead>
                    <tr className="text-muted-foreground border-b text-xs">
                      {["Player", "Platform", "Rank", "Last sync"].map((h) => (
                        <th key={h} className="px-2 py-2 font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 3 }).map((_, i) => (
                      <tr
                        key={i}
                        className="border-border/60 border-b last:border-0"
                      >
                        <td className="px-2 py-2">
                          <SkeletonBar className="h-4 w-40" />
                        </td>
                        <td className="px-2 py-2">
                          <SkeletonBar className="h-3 w-8" />
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-2">
                            <SkeletonBar className="h-6 w-6 rounded-sm" />
                            <SkeletonBar className="h-4 w-24" />
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <SkeletonBar className="h-3 w-28" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
