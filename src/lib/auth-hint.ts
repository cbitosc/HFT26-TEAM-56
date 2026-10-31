// The landing page is static, so the server can't tailor it to the visitor.
// Instead <html data-auth="in|out"> picks which calls to action show:
// `.signed-out-only` (Sign in, Get started) or `.signed-in-only` (Dashboard).
// This is a display hint only; every protected route still verifies the
// session on the server.

/**
 * Runs in <head> before first paint: a Supabase session cookie
 * (sb-<project>-auth-token, possibly split into .0, .1 …) means signed in.
 */
export const authHintScript = `(function(){try{document.documentElement.dataset.auth=/(^|;\\s*)sb-[^=;]+-auth-token(\\.\\d+)?=/.test(document.cookie)?"in":"out"}catch(e){}})()`;

export function setAuthHint(signedIn: boolean) {
  document.documentElement.dataset.auth = signedIn ? "in" : "out";
}
