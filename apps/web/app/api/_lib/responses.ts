import { AppError } from "@apex-assistant/core";
import { NextResponse } from "next/server";

export function toApiError(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode }
    );
  }

  return NextResponse.json(
    { error: "Unexpected error", code: "INTERNAL_ERROR" },
    { status: 500 }
  );
}
