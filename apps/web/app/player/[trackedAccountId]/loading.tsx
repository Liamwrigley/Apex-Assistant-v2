import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function SkeletonBar(props: { className?: string }) {
  return (
    <div
      className={cn(
        "bg-muted/70 animate-pulse rounded-md",
        props.className,
      )}
      aria-hidden
    />
  );
}

export default function PlayerProfileLoading() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <nav className="text-muted-foreground flex items-center gap-1.5 text-sm">
          <SkeletonBar className="h-4 w-20" />
          <span>/</span>
          <SkeletonBar className="h-4 w-32" />
        </nav>
        <div className="flex items-center gap-3">
          <SkeletonBar className="h-3 w-28" />
          <SkeletonBar className="h-8 w-[140px] rounded-md" />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[280px_1fr] md:items-stretch">
        <div className="relative isolate flex min-h-[400px] flex-col overflow-hidden rounded-lg border md:h-full md:min-h-0">
          <div className="bg-muted/40 absolute inset-0 animate-pulse" aria-hidden />
          <div className="relative z-[1] mt-auto flex flex-col gap-2 p-2.5">
            <div className="rounded-lg border border-white/15 bg-background/65 p-2.5 backdrop-blur-md">
              <SkeletonBar className="h-4 w-[75%] max-w-[12rem]" />
              <SkeletonBar className="mt-2 h-3 w-16" />
              <SkeletonBar className="mt-3 h-3 w-40" />
            </div>
          </div>
        </div>

        <div className="flex min-h-[400px] flex-col gap-4 md:h-full md:min-h-0">
          <Card>
            <CardHeader className="pb-2">
              <SkeletonBar className="h-4 w-36" />
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <SkeletonBar className="h-16" />
              <SkeletonBar className="h-16" />
              <SkeletonBar className="h-16" />
            </CardContent>
          </Card>
          <Card className="min-h-[175px] border-cyan-500/20">
            <CardHeader className="pb-2">
              <SkeletonBar className="h-4 w-40" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <SkeletonBar className="h-14" />
                <SkeletonBar className="h-14" />
                <SkeletonBar className="h-14" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <SkeletonBar className="h-5 w-48" />
          <SkeletonBar className="mt-2 h-3 w-full max-w-md" />
        </CardHeader>
        <CardContent className="space-y-2">
          <SkeletonBar className="h-10 w-full" />
          <SkeletonBar className="h-10 w-full" />
          <SkeletonBar className="h-10 w-full" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SkeletonBar className="h-5 w-40" />
          <SkeletonBar className="mt-2 h-3 w-56" />
        </CardHeader>
        <CardContent className="space-y-2">
          <SkeletonBar className="h-24 w-full" />
        </CardContent>
      </Card>
    </main>
  );
}
