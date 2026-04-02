import { AppError, SlidingWindowLimiter } from "@apex-assistant/core";
import { assertOwnerOrAdmin } from "@apex-assistant/core";
import { linkTrackedAccounts, pool } from "@apex-assistant/db";
import { NextResponse } from "next/server";
import { getRequesterFromHeaders } from "../../_lib/auth.js";
import { toApiError } from "@/app/api/_lib/responses";

const limiter = new SlidingWindowLimiter(
  Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60000),
  Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 60)
);

type TBody = {
  sourceTrackedAccountId: string;
  targetTrackedAccountId: string;
  reason?: string;
};

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const identity = getRequesterFromHeaders(request.headers);
    limiter.assertAllowed(`${identity.guildId}:${identity.userId}:identity:link`);
    const body = (await request.json()) as TBody;
    if (!body.sourceTrackedAccountId || !body.targetTrackedAccountId) {
      throw new AppError("Missing source/target account ids.", 400, "BAD_REQUEST");
    }
    const accounts = await pool.query<{ id: string; ownerUserId: string }>(
      `
      select id, owner_user_id as "ownerUserId"
      from tracked_accounts
      where guild_id = $1 and id = any($2::uuid[])
      `,
      [identity.guildId, [body.sourceTrackedAccountId, body.targetTrackedAccountId]]
    );
    if ((accounts.rowCount ?? 0) !== 2) {
      throw new AppError("Tracked account not found.", 404, "NOT_FOUND");
    }
    for (const account of accounts.rows) {
      assertOwnerOrAdmin({
        ownerUserId: account.ownerUserId,
        requesterUserId: identity.userId,
        isAdmin: identity.isAdmin
      });
    }

    const result = await linkTrackedAccounts({
      guildId: identity.guildId,
      actorUserId: identity.userId,
      sourceTrackedAccountId: body.sourceTrackedAccountId,
      targetTrackedAccountId: body.targetTrackedAccountId,
      reason: (body.reason ?? "manual_link").trim() || "manual_link"
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return toApiError(error);
  }
}

