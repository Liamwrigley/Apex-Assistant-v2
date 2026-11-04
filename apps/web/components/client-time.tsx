"use client";

import { useHydrated } from "@/hooks/use-hydrated";
import { formatRelativeTime } from "@/lib/format-relative-time";

const PLACEHOLDER = " ";

/** "5m ago", rendered after hydration so cached HTML never disagrees with the client clock. */
export function RelativeTime(props: { iso: string; title?: string }) {
  const hydrated = useHydrated();
  return (
    <span title={hydrated ? props.title : undefined}>
      {hydrated ? formatRelativeTime(props.iso) : PLACEHOLDER}
    </span>
  );
}

/** Timestamp in the viewer's locale and timezone, rendered after hydration. */
export function LocalDateTime(props: { iso: string }) {
  const hydrated = useHydrated();
  return <>{hydrated ? new Date(props.iso).toLocaleString() : PLACEHOLDER}</>;
}
