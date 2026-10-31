import "server-only";
import { io } from "next/cache";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseEnv } from "@/lib/supabase/env";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Create one per request; never share it across requests.
 */
export async function createClient() {
  const cookieStore = await cookies();
  // Session checks compare the token's expiry with the current time, so mark
  // everything after this as request-time work rather than prerenderable.
  await io();
  const { url, key } = getSupabaseEnv();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components can't write cookies. The proxy refreshes the
          // session on protected routes, so this is safe to ignore.
        }
      },
    },
  });
}
