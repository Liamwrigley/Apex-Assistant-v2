"use client";

import { cn } from "@/lib/utils";

/**
 * Small segmented-control used wherever we need a compact 2–3 option switch
 * (leaderboard view mode, session detail chart mode, RP delta window, etc.).
 * Generic over its value type so callers get full autocomplete on option
 * values without string fragility.
 */
export function ToggleGroup<T extends string>(props: {
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={props.ariaLabel}
      className={cn(
        "flex items-center gap-1 rounded-md border p-0.5",
        props.className,
      )}
    >
      {props.options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => props.onChange(opt.value)}
          className={cn(
            "rounded px-2.5 py-1 text-xs font-medium transition-colors",
            props.value === opt.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
