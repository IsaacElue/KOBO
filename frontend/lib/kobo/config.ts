/**
 * Split out of api.ts so lib/kobo/auth.ts can read API_URL/isMockMode without
 * an api.ts <-> auth.ts import cycle (api.ts calls into auth.ts for a valid
 * access token on every protected request; auth.ts needs to know where to
 * send its own requests).
 */
import { accessMode } from "@/lib/access/mode";

export const API_URL = process.env.NEXT_PUBLIC_KOBO_API_URL;

/** True while there's no real backend configured — see NEXT_PUBLIC_KOBO_API_URL in .env.example. */
export function isMockMode() {
  return !API_URL;
}

/**
 * Where a logged-out visitor hitting "/" gets sent (see AuthGate). Follows the
 * launch access mode (lib/access/mode.ts):
 *   waitlist -> "/waitlist"   (pre-launch: the campaign page is the public face)
 *   live     -> "/landing"    (launched: the marketing page is the public face)
 * Authenticated visitors at "/" are unaffected (AuthGate only reads this with
 * no session). In waitlist mode `proxy.ts` already redirects non-developers off
 * "/" before AuthGate runs; this covers the developer-with-no-session case and
 * the live-mode case.
 */
export const ROOT_REDIRECT_TARGET = accessMode() === "live" ? "/landing" : "/waitlist";
