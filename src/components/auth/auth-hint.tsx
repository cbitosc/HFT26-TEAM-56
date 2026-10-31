"use client";

import { useEffect } from "react";
import { setAuthHint } from "@/lib/auth-hint";
import { createClient } from "@/lib/supabase/client";

/**
 * Keeps <html data-auth> in step with the real session after the page loads:
 * the cookie check before paint can't tell an expired session from a live
 * one, and signing in or out in another tab changes it.
 */
export function AuthHint() {
  useEffect(() => {
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      return;
    }
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setAuthHint(Boolean(session)));
    return () => data.subscription.unsubscribe();
  }, []);

  return null;
}
