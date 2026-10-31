import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/supabase/env";

/**
 * Privileged client that bypasses RLS. Use only in trusted server code (e.g.
 * writing assessments or reading assessment_question_secrets), and always
 * scope queries to a user id you've verified with getCurrentUser().
 */
export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "Missing SUPABASE_SECRET_KEY. Add your Supabase secret key to .env.local (server only, never NEXT_PUBLIC_).",
    );
  }

  return createSupabaseClient(getSupabaseEnv().url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
