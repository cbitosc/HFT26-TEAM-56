import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseEnv } from "@/lib/supabase/env";

export const PROTECTED_PREFIXES = ["/dashboard", "/assessment", "/results"];

function isProtected(pathname: string) {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Refreshes the Supabase session cookie and applies optimistic route guards.
 * Pages still verify the user on the server; this only avoids rendering a
 * protected page for a visitor who is obviously signed out.
 */
export async function updateSession(request: NextRequest) {
  const { url, key } = getSupabaseEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([header, value]) =>
          response.headers.set(header, value),
        );
      },
    },
  });

  // Must run before any other logic: it validates the JWT and refreshes
  // an expired session, writing the new tokens through setAll above.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const { pathname, search } = request.nextUrl;

  if (!signedIn && isProtected(pathname)) {
    const target = request.nextUrl.clone();
    target.pathname = "/login";
    target.search = "";
    target.searchParams.set("next", `${pathname}${search}`);
    return redirectWithCookies(target, response);
  }

  if (signedIn && pathname === "/login") {
    const target = request.nextUrl.clone();
    target.pathname = "/dashboard";
    target.search = "";
    return redirectWithCookies(target, response);
  }

  return response;
}

// Carry refreshed session cookies over to the redirect response.
function redirectWithCookies(target: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(target);
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  redirect.headers.set("Cache-Control", "private, no-store");
  return redirect;
}
