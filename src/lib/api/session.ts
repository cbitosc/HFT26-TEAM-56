import "server-only";
import { apiError } from "@/lib/api/http";
import { SESSION_ERROR_STATUS, SessionError } from "@/lib/assessment/session";

/** Maps workspace errors to API responses; anything unexpected is a logged 500. */
export function sessionErrorResponse(error: unknown, label: string) {
  if (error instanceof SessionError) {
    return apiError(SESSION_ERROR_STATUS[error.code], error.code, error.message);
  }
  console.error(`[assessment] ${label} failed`, error);
  return apiError(500, "server_error", "Something went wrong. Your saved work is safe; please try again.", true);
}

const running = new Map<string, number>();

/**
 * Limits concurrent executions per user in this server process, on top of
 * the per-minute limits recorded in the database. Returns a release
 * function, or null when the user is at the limit.
 */
export function acquireExecutionSlot(userId: string, max = 2) {
  const current = running.get(userId) ?? 0;
  if (current >= max) return null;
  running.set(userId, current + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const left = (running.get(userId) ?? 1) - 1;
    if (left <= 0) running.delete(userId);
    else running.set(userId, left);
  };
}
