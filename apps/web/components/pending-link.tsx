"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

function LinkPendingGlyph() {
  const { pending } = useLinkStatus();
  if (!pending) {
    return null;
  }
  return (
    <Loader2
      className="text-muted-foreground size-3 shrink-0 animate-spin opacity-80"
      aria-hidden
    />
  );
}

export type TPendingLinkProps = ComponentPropsWithoutRef<typeof Link> & {
  /** When false, the label does not shrink (omit inner truncate wrapper). */
  truncateLabel?: boolean;
};

/**
 * Next.js `<Link>` with a small spinner while the route transition is in flight.
 * Pair with a route `loading.tsx` so navigation shows destination loading UI immediately.
 */
export function PendingLink(props: TPendingLinkProps) {
  const { className, children, truncateLabel = true, ...rest } = props;
  const label: ReactNode = truncateLabel ? (
    <span className="min-w-0 flex-1 truncate">{children}</span>
  ) : (
    children
  );
  return (
    <Link
      prefetch={false}
      {...rest}
      className={cn("inline-flex max-w-full min-w-0 items-center gap-1.5", className)}
    >
      {label}
      <LinkPendingGlyph />
    </Link>
  );
}
