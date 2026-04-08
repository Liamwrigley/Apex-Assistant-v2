"use client";

import Link from "next/link";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { cn } from "@/lib/utils";
import { useState } from "react";

export type TTrackedAccountTableRow = {
  id: string;
  identityGroupId: string | null;
  ign: string;
  platform: string;
  externalPlayerId: string | null;
  createdAt: string;
  lastCheckedAt: string | null;
  currentRankName: string | null;
  currentRankDivision: string | null;
  currentRankIconUrl: string | null;
};

/** In-cell spine + dot (original style), inset so it reads with the player column. */
function LinkedRowRail(props: { isFirst: boolean; isLast: boolean }) {
  const { isFirst, isLast } = props;
  // Spine sits just left of the name block; short arms reach slightly further left.
  const spineLeft = "left-[10px]";
  return (
    <>
      <span
        className={cn(
          "bg-emerald-400/70 absolute w-[2px]",
          spineLeft,
          isFirst
            ? "top-1/2 bottom-0"
            : isLast
              ? "top-0 bottom-1/2"
              : "top-0 bottom-0",
        )}
        aria-hidden
      />

      <span
        className={cn(
          "bg-emerald-400 absolute top-1/2 z-[1] h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full",
          "left-[11px]",
        )}
        aria-hidden
      />
    </>
  );
}

export function TrackedAccountsOwnerTable(props: {
  ownerName: string;
  accounts: TTrackedAccountTableRow[];
}) {
  const [linkedHoverGroupId, setLinkedHoverGroupId] = useState<string | null>(
    null,
  );

  const groups = Object.values(
    props.accounts.reduce(
      (acc, row) => {
        const key = row.identityGroupId ?? `solo:${row.id}`;
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key].push(row);
        return acc;
      },
      {} as Record<string, TTrackedAccountTableRow[]>,
    ),
  );

  return (
    <div className="border-border/60 overflow-x-auto rounded-lg border">
      <div className="border-border/60 border-b bg-muted/40 px-3 py-2 text-sm font-medium">
        {props.ownerName}
      </div>
      <div className="min-w-0">
        <table className="w-full min-w-[900px] table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[18%]" />
            <col className="w-[10%]" />
            <col className="w-[22%]" />
            <col className="w-[22%]" />
            <col className="w-[14%]" />
            <col className="w-[14%]" />
          </colgroup>
          <thead>
            <tr className="text-muted-foreground border-b text-xs">
              <th className="px-2 py-2 font-medium" title="Tracked player IGN">
                Player
              </th>
              <th
                className="px-2 py-2 font-medium"
                title="Input platform used for provider lookups"
              >
                Platform
              </th>
              <th
                className="px-2 py-2 font-medium"
                title="Last ingested ranked tier and division"
              >
                Rank
              </th>
              <th
                className="px-2 py-2 font-medium"
                title="Provider-specific unique account id"
              >
                Provider UID
              </th>
              <th
                className="px-2 py-2 font-medium"
                title="When this tracked account was created"
              >
                Date Added
              </th>
              <th
                className="px-2 py-2 text-right font-medium"
                title="Last successful rank snapshot write"
              >
                Last Sync
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.flatMap((groupRows) =>
              groupRows.map((row, index) => {
                const isLinked = groupRows.length > 1;
                const isFirst = index === 0;
                const isLast = index === groupRows.length - 1;
                const linkId = row.identityGroupId;
                const rowHighlighted = Boolean(
                  isLinked &&
                  linkId &&
                  linkedHoverGroupId &&
                  linkedHoverGroupId === linkId,
                );

                return (
                  <tr
                    key={row.id}
                    data-linked-group={isLinked && linkId ? linkId : undefined}
                    className={cn(
                      "border-border/60 border-b transition-colors duration-150 last:border-0",
                      isLinked && linkId && "group/linked",
                      rowHighlighted && "bg-emerald-500/15",
                    )}
                    onMouseEnter={() => {
                      if (isLinked && linkId) {
                        setLinkedHoverGroupId(linkId);
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isLinked || !linkId) {
                        return;
                      }
                      const rel = e.relatedTarget;
                      if (
                        rel instanceof Element &&
                        rel.closest(`tr[data-linked-group="${linkId}"]`)
                      ) {
                        return;
                      }
                      setLinkedHoverGroupId(null);
                    }}
                  >
                    <td
                      className={cn(
                        "relative px-2 py-2 font-medium truncate",
                        isLinked && "overflow-visible pl-[1.35rem]",
                      )}
                      title={row.ign}
                    >
                      {isLinked ? (
                        <LinkedRowRail isFirst={isFirst} isLast={isLast} />
                      ) : null}
                      <Link href={`/player/${row.id}`} className="relative z-[2] hover:underline">{row.ign}</Link>
                    </td>
                    <td className="px-2 py-2 uppercase whitespace-nowrap">
                      {row.platform}
                    </td>
                    <td className="px-2 py-2">
                      {row.currentRankName ? (
                        <div className="flex min-w-0 items-center gap-2">
                          {row.currentRankIconUrl ? (
                            <img
                              src={row.currentRankIconUrl}
                              alt=""
                              className="h-8 w-8 shrink-0 object-contain"
                            />
                          ) : null}
                          <div className="min-w-0">
                            <div className="truncate font-medium leading-tight">
                              {row.currentRankName}
                              {row.currentRankDivision
                                ? ` ${row.currentRankDivision}`
                                : ""}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td
                      className="px-2 py-2 font-mono text-xs truncate"
                      title={row.externalPlayerId ?? "-"}
                    >
                      {row.externalPlayerId ?? "-"}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      {new Date(row.createdAt).toLocaleString()}
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      {row.lastCheckedAt ? (
                        <span
                          title={new Date(row.lastCheckedAt).toLocaleString()}
                        >
                          {formatRelativeTime(row.lastCheckedAt)}
                        </span>
                      ) : (
                        "Never"
                      )}
                    </td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
