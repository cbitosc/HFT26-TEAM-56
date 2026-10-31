import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

// Only routes that read the session. The landing page stays fully static.
export const config = {
  matcher: [
    "/login",
    "/dashboard/:path*",
    "/assessment/:path*",
    "/results/:path*",
  ],
};
