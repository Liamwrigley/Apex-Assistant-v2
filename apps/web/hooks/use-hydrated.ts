"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * `false` on the server and during hydration, `true` afterwards. Gate any text
 * that depends on the current time or the viewer's timezone behind it: the
 * homepage HTML is ISR-cached (minutes old, rendered in UTC), so rendering that
 * text during hydration causes a mismatch and React re-renders the whole page.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
