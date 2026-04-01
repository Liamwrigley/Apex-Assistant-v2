import { AppError } from "@apex-assistant/core";

export function getRequesterFromHeaders(headers: Headers): {
  userId: string;
  guildId: string;
  isAdmin: boolean;
} {
  const userId = headers.get("x-user-id");
  const guildId = headers.get("x-guild-id");
  const role = headers.get("x-role") ?? "member";
  const signature = headers.get("x-app-secret");

  if (!userId || !guildId) {
    throw new AppError("Missing request identity headers.", 401, "UNAUTHORIZED");
  }

  const expectedSecret = process.env.APP_SHARED_SECRET;
  if (expectedSecret && signature !== expectedSecret) {
    throw new AppError("Invalid request signature.", 401, "UNAUTHORIZED");
  }

  return { userId, guildId, isAdmin: role === "admin" };
}
