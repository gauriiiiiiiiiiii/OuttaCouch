/**
 * Returns false when the request carries an Origin header that doesn't match
 * this app's own origin. Protects state-mutating endpoints from cross-site
 * request forgery.
 *
 * Same-origin browser requests always pass (Origin matches).
 * Non-browser clients (curl, server-to-server) have no Origin header — they
 * pass through so as not to break legitimate programmatic usage.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // no origin → not a browser cross-site request

  const appUrl =
    process.env.NEXTAUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000";

  try {
    return new URL(appUrl).origin === origin;
  } catch {
    return false;
  }
}
