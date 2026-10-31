import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  provider: string | null;
  createdAt: string | null;
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Verified current user, deduplicated per request. Redirects to /login when
 * there is no valid session. Falls back to the token's OAuth metadata when
 * the profile row is missing or a provider didn't share a field.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error || !claims) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, avatar_url, provider, created_at")
    .eq("id", claims.sub)
    .maybeSingle();

  const meta = claims.user_metadata ?? {};

  return {
    id: claims.sub,
    email: readString(profile?.email) ?? readString(claims.email),
    fullName:
      readString(profile?.full_name) ??
      readString(meta.full_name) ??
      readString(meta.name) ??
      readString(meta.user_name),
    avatarUrl:
      readString(profile?.avatar_url) ??
      readString(meta.avatar_url) ??
      readString(meta.picture),
    provider:
      readString(profile?.provider) ?? readString(claims.app_metadata?.provider),
    createdAt: readString(profile?.created_at),
  };
});

/**
 * Verified user id for Route Handlers, or null when signed out. Unlike
 * getCurrentUser() it never redirects, so APIs can answer 401 themselves.
 */
export async function getVerifiedUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  return error || !data?.claims ? null : data.claims.sub;
}

export function displayName(user: CurrentUser) {
  return user.fullName ?? user.email?.split("@")[0] ?? "there";
}
