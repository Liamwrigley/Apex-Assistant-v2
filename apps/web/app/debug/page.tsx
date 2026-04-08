import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export const dynamic = "force-dynamic";

const debugPages = [
  {
    href: "/debug/segments",
    title: "Segment Debug",
    description:
      "Per-account presence snapshots, rank changes, inferred game segments with trigger signals and confidence. For rubric tuning.",
  },
  {
    href: "/debug/realtime",
    title: "Realtime Presence",
    description:
      "Raw provider fields and derived visibility decision for each tracked account.",
  },
  {
    href: "/debug/identity",
    title: "Identity Links",
    description:
      "View and manage identity group links across tracked accounts. Requires ADMIN_UI_KEY.",
  },
];

export default function DebugIndexPage() {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Debug Tools</h1>
        <p className="text-muted-foreground text-sm">
          Internal diagnostic and admin pages. Not linked from the main navigation.
        </p>
      </div>

      <div className="grid gap-4">
        {debugPages.map((page) => (
          <Link key={page.href} href={page.href} className="block">
            <Card className="border-border/60 hover:border-border transition-colors">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{page.title}</CardTitle>
                <CardDescription>{page.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <span className="text-muted-foreground text-xs font-mono">{page.href}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
