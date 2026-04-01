import { AppError, SlidingWindowLimiter } from "@apex-assistant/core";
import { pool } from "@apex-assistant/db";
import { NextResponse } from "next/server";
import { getRequesterFromHeaders } from "../../_lib/auth.js";
import { toApiError } from "@/app/api/_lib/responses";

const limiter = new SlidingWindowLimiter(
  Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60000),
  Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 60)
);

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const identity = getRequesterFromHeaders(request.headers);
    limiter.assertAllowed(`${identity.guildId}:${identity.userId}:track:remove`);
    const { id } = await context.params;

    const existing = await pool.query<{ ownerUserId: string }>(
      `
      select owner_user_id as "ownerUserId"
      from tracked_accounts
      where id = $1 and guild_id = $2
      `,
      [id, identity.guildId]
    );

    if (existing.rowCount === 0) {
      throw new AppError("Tracked account not found.", 404, "NOT_FOUND");
    }

    const ownerUserId = existing.rows[0].ownerUserId;
    if (ownerUserId !== identity.userId && !identity.isAdmin) {
      throw new AppError("You can only remove your own tracked accounts.", 403, "FORBIDDEN");
    }

    await pool.query("delete from tracked_accounts where id = $1", [id]);
    return NextResponse.json({ removed: true });
  } catch (error) {
    return toApiError(error);
  }
}
