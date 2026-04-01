import { AppError } from "./types.js";

export function assertOwnerOrAdmin(params: {
  ownerUserId: string;
  requesterUserId: string;
  isAdmin: boolean;
}): void {
  if (params.ownerUserId === params.requesterUserId || params.isAdmin) {
    return;
  }

  throw new AppError(
    "You can only modify your own tracked accounts.",
    403,
    "FORBIDDEN"
  );
}
