import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth-redirect";
import { createClient } from "@/lib/supabase/server";

function redirectTo(path: string, origin: string) {
  const response = NextResponse.redirect(new URL(path, origin));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

/**
 * OAuth redirect target. Exchanges the one-time PKCE code for a session and
 * stores it in cookies, then sends the user on to where they were headed.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  // The provider or Supabase reports failures (e.g. the user denied access)
  // through `error` instead of returning a code.
  const providerError = searchParams.get("error");
  if (providerError) {
    const reason =
      providerError === "access_denied" ? "access_denied" : "oauth_failed";
    return redirectTo(`/login?error=${reason}`, origin);
  }

  const code = searchParams.get("code");
  if (!code) {
    return redirectTo("/login?error=missing_code", origin);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return redirectTo("/login?error=auth_callback_failed", origin);
  }

  return redirectTo(safeNextPath(searchParams.get("next")), origin);
}
