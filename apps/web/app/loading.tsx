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

export default function HomeLoading() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <SkeletonBar className="h-5 w-40" />
            <SkeletonBar className="mt-2 h-3 w-64" />
          </CardHeader>
          <CardContent className="space-y-2">
            <SkeletonBar className="h-32 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <SkeletonBar className="h-5 w-36" />
            <SkeletonBar className="mt-2 h-3 w-52" />
          </CardHeader>
          <CardContent className="space-y-2">
            <SkeletonBar className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <SkeletonBar className="h-5 w-44" />
          <SkeletonBar className="mt-2 h-3 w-72" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <SkeletonBar className="h-[360px] rounded-lg" />
            <SkeletonBar className="h-[360px] rounded-lg" />
            <SkeletonBar className="h-[360px] rounded-lg" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <SkeletonBar className="h-5 w-48" />
          <SkeletonBar className="mt-2 h-3 w-80" />
        </CardHeader>
        <CardContent className="space-y-2">
          <SkeletonBar className="h-24 w-full" />
        </CardContent>
      </Card>
    </main>
  );
}
