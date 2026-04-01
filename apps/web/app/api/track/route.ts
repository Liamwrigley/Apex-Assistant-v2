import { AppError, SlidingWindowLimiter, type TPlatform } from "@apex-assistant/core";
import {
  addTrackedAccount,
  countTrackedByGuild,
  countTrackedByOwner,
  upsertUser
} from "@apex-assistant/db";
import { NextResponse } from "next/server";
import { getRequesterFromHeaders } from "../_lib/auth.js";
import { toApiError } from "@/app/api/_lib/responses";

const limiter = new SlidingWindowLimiter(
  Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60000),
  Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 60)
);

type TTrackBody = { ign: string; platform: TPlatform };

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const identity = getRequesterFromHeaders(request.headers);
    limiter.assertAllowed(`${identity.guildId}:${identity.userId}:track:add`);

    const body = (await request.json()) as TTrackBody;
    if (!body.ign || !body.platform) {
      throw new AppError("Missing ign or platform.", 400, "BAD_REQUEST");
    }

    const maxByUser = Number(process.env.MAX_TRACKED_ACCOUNTS_PER_USER ?? 5);
    const maxByGuild = Number(process.env.MAX_TRACKED_ACCOUNTS_PER_GUILD ?? 100);
    const ownerCount = await countTrackedByOwner(identity.guildId, identity.userId);
    const guildCount = await countTrackedByGuild(identity.guildId);

    if (ownerCount >= maxByUser) {
      throw new AppError("You reached your account tracking limit.", 400, "USER_LIMIT");
    }
    if (guildCount >= maxByGuild) {
      throw new AppError("This guild reached the tracking cap.", 400, "GUILD_LIMIT");
    }

    await upsertUser({
      discordUserId: identity.userId,
      displayName: request.headers.get("x-user-name")
    });

    const account = await addTrackedAccount({
      guildId: identity.guildId,
      ownerUserId: identity.userId,
      ign: body.ign.trim(),
      platform: body.platform
    });
    return NextResponse.json(account, { status: 201 });
  } catch (error) {
    return toApiError(error);
  }
}
