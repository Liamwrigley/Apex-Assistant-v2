"use client";

import { useId, useRef } from "react";

export function SegmentTriggerCell(props: { segmentId: string; triggerSignals: unknown }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const raw = JSON.stringify(props.triggerSignals);
  const previewLen = 72;
  const needsDialog = raw.length > previewLen;

  return (
    <div className="max-w-[min(22rem,40vw)]">
      <code className="text-muted-foreground block break-all text-[10px] leading-snug">
        {needsDialog ? `${raw.slice(0, previewLen)}…` : raw}
      </code>
      {needsDialog ? (
        <>
          <button
            type="button"
            className="text-primary mt-1 cursor-pointer text-[10px] font-medium underline-offset-2 hover:underline"
            onClick={() => dialogRef.current?.showModal()}
          >
            View full JSON
          </button>
          <dialog
            ref={dialogRef}
            className="bg-background text-foreground fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border p-0 shadow-lg backdrop:bg-black/50"
            aria-labelledby={titleId}
          >
            <div className="border-border flex items-center justify-between border-b px-4 py-2">
              <h2 id={titleId} className="text-sm font-semibold">
                Segment trigger
              </h2>
              <form method="dialog">
                <button
                  type="submit"
                  className="text-muted-foreground hover:text-foreground rounded-md px-2 py-1 text-xs"
                >
                  Close
                </button>
              </form>
            </div>
            <pre className="max-h-[min(70vh,32rem)] overflow-auto p-4 text-left text-[11px] leading-relaxed whitespace-pre-wrap break-words">
              {JSON.stringify(props.triggerSignals, null, 2)}
            </pre>
            <p className="text-muted-foreground border-border border-t px-4 py-2 text-[10px]">
              id: {props.segmentId}
            </p>
          </dialog>
        </>
      ) : null}
    </div>
  );
}
