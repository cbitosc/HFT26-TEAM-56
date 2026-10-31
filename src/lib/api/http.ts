import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { getVerifiedUserId } from "@/lib/auth";
import type { ApiErrorBody } from "@/lib/resumes/constants";

const NO_STORE = { "Cache-Control": "private, no-store" };

export function json<T>(body: T, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function apiError(
  status: number,
  code: string,
  message: string,
  retryable = false,
) {
  const body: ApiErrorBody = { error: { code, message, retryable } };
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/**
 * Rejects cross-site writes. Browsers always send Origin on POST, and the
 * session cookie is SameSite=Lax, so this is defence in depth against CSRF.
 */
function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const allowed = new Set([request.nextUrl.origin]);
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    allowed.add(new URL(process.env.NEXT_PUBLIC_SITE_URL).origin);
  }
  return allowed.has(origin);
}

type Guard = { userId: string; response?: never } | { userId?: never; response: NextResponse };

/** Verifies the session (and origin for writes). Returns the user id or an error response. */
export async function requireUser(request: NextRequest): Promise<Guard> {
  if (request.method !== "GET" && !isSameOrigin(request)) {
    return { response: apiError(403, "forbidden_origin", "Cross-site requests are not allowed.") };
  }
  const userId = await getVerifiedUserId();
  if (!userId) {
    return { response: apiError(401, "unauthorized", "Please sign in again.") };
  }
  return { userId };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string) {
  return UUID.test(value);
}

const MAX_BODY_BYTES = 256 * 1024;

type Parsed<T> = { data: T; response?: never } | { data?: never; response: NextResponse };

/** Reads a JSON body and validates it with `schema`. Answers 400/413 itself. */
export async function parseBody<T extends z.ZodType>(request: NextRequest, schema: T): Promise<Parsed<z.infer<T>>> {
  let text: string;
  try {
    text = await request.text();
  } catch {
    return { response: apiError(400, "invalid_request", "Couldn't read the request body.") };
  }
  if (text.length > MAX_BODY_BYTES) {
    return { response: apiError(413, "too_large", "That's too large to save. Shorten it and try again.") };
  }
  let raw: unknown;
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    return { response: apiError(400, "invalid_request", "Request body must be JSON.") };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    return { response: apiError(400, "invalid_request", issue?.message ?? "Invalid request.") };
  }
  return { data: result.data };
}
