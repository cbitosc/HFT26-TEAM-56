export const DEFAULT_AUTH_REDIRECT = "/dashboard";

/**
 * Only same-origin, absolute paths are allowed as post-login destinations.
 * Rejects protocol-relative (`//evil.com`) and backslash (`/\evil.com`) tricks.
 */
export function safeNextPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) {
    return DEFAULT_AUTH_REDIRECT;
  }
  if (value.startsWith("//") || value.startsWith("/\\")) {
    return DEFAULT_AUTH_REDIRECT;
  }
  if (value === "/login" || value.startsWith("/auth/")) {
    return DEFAULT_AUTH_REDIRECT;
  }
  return value;
}
