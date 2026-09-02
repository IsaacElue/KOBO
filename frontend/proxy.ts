import { NextResponse, type NextRequest } from "next/server";
import { accessMode, ACCESS_GRANT_COOKIE } from "@/lib/access/mode";
import { verifyGrant } from "@/lib/access/grant";

/**
 * Server-enforced launch access gate (Next.js 16 Proxy — the renamed
 * `middleware`, Node.js runtime).
 *
 *   NEXT_PUBLIC_KOBO_ACCESS_MODE = live      -> no gating, normal routing.
 *   NEXT_PUBLIC_KOBO_ACCESS_MODE = waitlist  -> the public reaches ONLY
 *       /waitlist. /, /landing, the app, and every other route 307 -> /waitlist,
 *       UNLESS the request carries a valid signed developer access grant
 *       (`kobo_access` cookie, minted by GET /auth/access after a DB
 *       `access_role` check, verified here offline with KOBO_ACCESS_GRANT_SECRET).
 *
 * This runs before any route renders, so typing the URL directly is gated the
 * same as clicking a link. It is the primary enforcement; `AuthGate` adds a
 * client-side backstop for the one URL the proxy must leave open (the sign-in
 * form at /?auth=login).
 *
 * Not a data boundary — every API endpoint is independently `requireAuth` +
 * own-resource. This gate is about not exposing the pre-launch product UI.
 */

// Reachable by anyone in waitlist mode.
const PUBLIC_PREFIXES = ["/waitlist"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * The developer sign-in entry: the SPA at "/" with an explicit `?auth=login`
 * intent. Left open so a developer can actually authenticate (and then receive
 * their grant cookie). A normal user who signs in here still cannot render the
 * app (AuthGate mode-gate) and still cannot reach any other product route.
 * `?auth=signup` is NOT opened — new public accounts are closed pre-launch.
 */
function isDeveloperSignInEntry(url: URL): boolean {
  return url.pathname === "/" && url.searchParams.get("auth") === "login";
}

export function proxy(request: NextRequest): NextResponse {
  if (accessMode() === "live") return NextResponse.next();

  const url = request.nextUrl;

  if (isPublicPath(url.pathname) || isDeveloperSignInEntry(url)) {
    return NextResponse.next();
  }

  const grant = verifyGrant(request.cookies.get(ACCESS_GRANT_COOKIE)?.value);
  if (grant) return NextResponse.next();

  const dest = new URL("/waitlist", url);
  dest.search = "";
  return NextResponse.redirect(dest, 307);
}

export const config = {
  matcher: [
    /*
     * Run on everything EXCEPT:
     *  - _next/static, _next/image  (build assets)
     *  - favicon.ico, robots.txt, sitemap.xml, manifest files
     *  - any path with a file extension (images, fonts, .json, ...)
     * `_next/data` is still covered by Next intentionally (data routes must be
     * gated alongside their page).
     */
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.[a-zA-Z0-9]+$).*)",
  ],
};
