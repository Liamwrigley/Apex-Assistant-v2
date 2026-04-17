import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function SkeletonBar(props: { className?: string }) {
  return (
    <div
      className={cn("bg-muted/70 animate-pulse rounded-md", props.className)}
      aria-hidden
    />
  );
}

function ProfileStatCardSkeleton(props: { borderClass: string }) {
  return (
    <Card className={props.borderClass}>
      <CardHeader className="space-y-1 p-2.5">
        <SkeletonBar className="h-2.5 w-[85%] max-w-[7rem]" />
        <SkeletonBar className="h-6 w-12" />
      </CardHeader>
    </Card>
  );
}

export default function PlayerProfileLoading() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      {/* Breadcrumb + range picker */}
      <div className="flex items-center justify-between gap-4">
        <nav className="text-muted-foreground flex items-center gap-1.5 text-sm">
          <Link href="/" className="hover:text-foreground transition-colors">
            Dashboard
          </Link>
          <span>/</span>
          <SkeletonBar className="h-4 w-36 max-w-[40vw]" />
        </nav>
        <div className="flex items-center gap-3">
          <SkeletonBar className="h-3 w-36" />
          <SkeletonBar className="h-9 w-[140px] rounded-md" />
        </div>
      </div>

      {/* Hero + right column */}
      <div className="grid gap-6 md:grid-cols-[280px_1fr] md:items-stretch">
        {/* Left: hero + glass panel (matches PlayerProfileHeroImage layout) */}
        <div className="relative isolate flex min-h-[400px] flex-col overflow-hidden rounded-lg border md:h-full md:min-h-0">
          <div className="bg-muted/50 absolute inset-0 animate-pulse" aria-hidden />
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/15 via-black/25 to-black/65"
            aria-hidden
          />
          <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
            <div className="min-h-[180px] flex-1" aria-hidden />
            <div className="flex flex-none flex-col gap-2 p-2.5">
              <div
                className={cn(
                  "rounded-lg border border-white/15 shadow-lg",
                  "bg-background/78 backdrop-blur-md supports-[backdrop-filter]:bg-background/65",
                  "px-2.5 py-2",
                )}
              >
                <SkeletonBar className="h-4 w-[75%] max-w-[12rem]" />
                <SkeletonBar className="mt-2 h-3 w-12" />
                <div className="mt-2 flex items-center gap-2">
                  <SkeletonBar className="h-4 w-4 shrink-0 rounded-sm" />
                  <SkeletonBar className="h-3 w-28" />
                </div>
                <div className="border-border/50 mt-2 flex flex-wrap gap-1 border-t border-dashed pt-2">
                  <SkeletonBar className="h-5 w-9 rounded px-1.5" />
                  <SkeletonBar className="h-5 w-14 rounded px-1.5" />
                  <SkeletonBar className="h-5 w-24 max-w-full rounded px-1.5" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: range stats grid + session / offline card */}
        <div className="flex min-h-[400px] flex-col gap-4 md:h-full md:min-h-0">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ProfileStatCardSkeleton borderClass="border-emerald-500/20 bg-emerald-500/5" />
            <ProfileStatCardSkeleton borderClass="border-cyan-500/20 bg-cyan-500/5" />
            <ProfileStatCardSkeleton borderClass="border-violet-500/20 bg-violet-500/5" />
            <ProfileStatCardSkeleton borderClass="border-amber-500/20 bg-amber-500/5" />
          </div>

          {/* Career strip — matches bordered career card when stats exist */}
          <Card className="border-border/80 bg-muted/25">
            <CardContent className="p-0 px-4 py-3.5 sm:px-5">
              <div className="mb-3 flex items-center gap-3">
                <span
                  className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent"
                  aria-hidden
                />
                <span className="text-muted-foreground flex shrink-0 flex-col items-center gap-0.5 text-center">
                  <span className="text-[10px] font-medium uppercase tracking-[0.18em]">Career</span>
                  <span className="text-[10px] font-normal normal-case tracking-normal text-muted-foreground/90">
                    Δ vs range
                  </span>
                </span>
                <span
                  className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent"
                  aria-hidden
                />
              </div>
              <div className="grid grid-cols-3 divide-x divide-border/60">
                {["Kills", "Damage", "Wins"].map((label) => (
                  <div key={label} className="min-w-0 px-2 first:pr-4 last:pl-4 sm:px-8">
                    <p className="text-muted-foreground text-[11px] tracking-wide">{label}</p>
                    <SkeletonBar className="mt-2 h-8 w-16 max-w-full" />
                    <SkeletonBar className="mt-2 h-5 w-12" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Current session / offline — single tinted card */}
          <Card className="min-h-[175px] border-cyan-500/30 bg-cyan-500/5">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-cyan-400/80"
                  aria-hidden
                />
                <SkeletonBar className="h-4 w-40" />
                <SkeletonBar className="h-3 w-16 opacity-80" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className="space-y-1">
                  <SkeletonBar className="h-2.5 w-10" />
                  <SkeletonBar className="h-12 w-full max-w-[100px]" />
                </div>
                <div className="space-y-1">
                  <SkeletonBar className="h-2.5 w-8" />
                  <SkeletonBar className="h-12 w-full max-w-[100px]" />
                </div>
                <div className="space-y-1">
                  <SkeletonBar className="h-2.5 w-16" />
                  <SkeletonBar className="h-6 w-20" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* RP Timeline — chart height matches PlayerTimelineSparkline profile variant */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>RP Timeline</CardTitle>
            <SkeletonBar className="h-3 w-20" />
          </div>
          <CardDescription>Rank score over the selected time range.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/30 h-[220px] w-full animate-pulse rounded-md border border-border/40" />
        </CardContent>
      </Card>

      {/* Match History — mirrors the match grid + summary strip */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Match History</CardTitle>
            <SkeletonBar className="h-3 w-28" />
          </div>
          <CardDescription>
            Recent ranked games, newest top-left — hover a cell for details. Summary stats reflect the games in view.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-6">
            <div className="grid grid-cols-2 gap-x-4 gap-y-4 md:min-w-[340px] md:max-w-[420px] md:flex-shrink-0">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-1 leading-tight">
                  <SkeletonBar className="h-2.5 w-20" />
                  <div className="flex items-center gap-1.5">
                    {i === 0 || i === 1 ? (
                      <SkeletonBar className="h-7 w-7 rounded-sm" />
                    ) : null}
                    <div className="flex flex-col gap-1">
                      <SkeletonBar className="h-3 w-20" />
                      <SkeletonBar className="h-2.5 w-16" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex min-w-0 flex-1 justify-end">
              <div className="grid w-fit grid-cols-[repeat(20,minmax(0,auto))] gap-1.5">
                {Array.from({ length: 60 }).map((_, i) => (
                  <SkeletonBar key={i} className="h-6 w-6 rounded-[3px]" />
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Legend Performance */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Legend Performance</CardTitle>
            <SkeletonBar className="h-3 w-20" />
          </div>
          <CardDescription>Aggregated RP per legend.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-xs">
                  {["Legend", "Games", "Total RP", "Avg RP", "Avg Kills", "Avg Dmg", "+ve / -ve"].map(
                    (h) => (
                      <th key={h} className="px-2 py-2 font-medium">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-border/60 border-b last:border-0">
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        <SkeletonBar className="h-5 w-5 rounded-sm" />
                        <SkeletonBar className="h-4 w-24" />
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <SkeletonBar className="ml-auto h-4 w-6" />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <SkeletonBar className="ml-auto h-5 w-14" />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <SkeletonBar className="ml-auto h-5 w-12" />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <SkeletonBar className="ml-auto h-4 w-8" />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <SkeletonBar className="ml-auto h-4 w-10" />
                    </td>
                    <td className="text-muted-foreground px-2 py-2 text-right">
                      <SkeletonBar className="ml-auto h-4 w-12" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Map Performance */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Map Performance</CardTitle>
            <SkeletonBar className="h-3 w-20" />
          </div>
          <CardDescription>
            RP breakdown by ranked map. Per-legend rows expand under each map.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-xs">
                  {["Map", "Games", "Total RP", "Avg RP"].map((h) => (
                    <th key={h} className="px-2 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-border/60 border-b last:border-0">
                    <td className="px-2 py-2">
                      <SkeletonBar className="h-4 w-32" />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <SkeletonBar className="ml-auto h-4 w-8" />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <SkeletonBar className="ml-auto h-5 w-14" />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <SkeletonBar className="ml-auto h-5 w-12" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Recent sessions (profile: hide player column → min-w-[780px]) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Recent sessions</CardTitle>
            <SkeletonBar className="h-3 w-24" />
          </div>
          <CardDescription>
            In-progress sessions appear at the top with a live indicator. Completed sessions show rank at
            start vs end, RP change, and legends while active. Click a row for details.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="scrollbar-app w-full overflow-x-auto">
            <table className="min-w-[780px] w-full text-left text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-xs">
                  {["Start", "End", "RP Δ", "Legends", "Est. games", "Duration", "Finished"].map(
                    (label) => (
                      <th key={label} className="px-2 py-2 font-medium">
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-border/60 border-b last:border-0">
                    <td className="px-2 py-2 align-top">
                      <div className="flex items-start gap-2">
                        <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-muted/60" />
                        <SkeletonBar className="h-10 w-[88px]" />
                      </div>
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
    </main>
  );
}
