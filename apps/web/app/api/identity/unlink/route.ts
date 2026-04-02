import { AppError, SlidingWindowLimiter, assertOwnerOrAdmin } from "@apex-assistant/core";
import { pool, unlinkTrackedAccount } from "@apex-assistant/db";
import { NextResponse } from "next/server";
import { getRequesterFromHeaders } from "../../_lib/auth.js";
import { toApiError } from "@/app/api/_lib/responses";

const limiter = new SlidingWindowLimiter(
  Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60000),
  Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 60)
);

type TBody = {
  trackedAccountId: string;
  reason?: string;
};

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const identity = getRequesterFromHeaders(request.headers);
    limiter.assertAllowed(`${identity.guildId}:${identity.userId}:identity:unlink`);
    const body = (await request.json()) as TBody;
    if (!body.trackedAccountId) {
      throw new AppError("Missing tracked account id.", 400, "BAD_REQUEST");
    }
    const existing = await pool.query<{ ownerUserId: string }>(
      `
      select owner_user_id as "ownerUserId"
      from tracked_accounts
      where guild_id = $1 and id = $2
      `,
      [identity.guildId, body.trackedAccountId]
    );
    if ((existing.rowCount ?? 0) === 0) {
      throw new AppError("Tracked account not found.", 404, "NOT_FOUND");
    }
    assertOwnerOrAdmin({
      ownerUserId: existing.rows[0].ownerUserId,
      requesterUserId: identity.userId,
      isAdmin: identity.isAdmin
    });
    await unlinkTrackedAccount({
      guildId: identity.guildId,
      actorUserId: identity.userId,
      trackedAccountId: body.trackedAccountId,
      reason: (body.reason ?? "manual_unlink").trim() || "manual_unlink"
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return toApiError(error);
  }
}

