"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Provider } from "@supabase/supabase-js";
import { safeNextPath } from "@/lib/auth-redirect";
import { createClient } from "@/lib/supabase/server";

const PROVIDERS = ["google"] as const satisfies Provider[];

function isSupportedProvider(
  value: unknown,
): value is (typeof PROVIDERS)[number] {
  return PROVIDERS.includes(value as (typeof PROVIDERS)[number]);
}

async function getSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");

  // Server Actions already reject requests whose Origin doesn't match Host.
  const origin = (await headers()).get("origin");
  if (origin) return origin;

  throw new Error("Unable to determine the site URL. Set NEXT_PUBLIC_SITE_URL.");
}

export async function signInWithProvider(formData: FormData) {
  const provider = formData.get("provider");
  if (!isSupportedProvider(provider)) {
    redirect("/login?error=invalid_provider");
  }

  const next = safeNextPath(formData.get("next"));
  const callback = new URL("/auth/callback", await getSiteUrl());
  callback.searchParams.set("next", next);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: callback.toString(),
      // Let people with several Google accounts choose which one to use.
      queryParams: { prompt: "select_account" },
    },
  });

  if (error || !data.url) {
    redirect("/login?error=oauth_start_failed");
  }

  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
