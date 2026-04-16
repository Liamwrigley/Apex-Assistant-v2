import Image from "next/image";
import Link from "next/link";
import { SiteHeaderHealth } from "@/components/site-header-health";

export function SiteHeaderFallback() {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="Apex Assistant logo"
            width={44}
            height={44}
            className="rounded-full"
            priority
          />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Apex Assistant
            </h1>
            <p className="text-muted-foreground text-sm">
              Live tracker dashboard
            </p>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          <div className="text-muted-foreground flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-zinc-500" />
              <span>Worker</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-zinc-500" />
              <span>Discord</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function SiteHeader() {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="Apex Assistant logo"
            width={44}
            height={44}
            className="rounded-full"
            priority
          />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Apex Assistant
            </h1>
            <p className="text-muted-foreground text-sm">
              Live tracker dashboard
            </p>
          </div>
        </Link>
        <SiteHeaderHealth />
      </div>
    </section>
  );
}
