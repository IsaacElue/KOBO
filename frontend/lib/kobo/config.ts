/**
 * Split out of api.ts so lib/kobo/auth.ts can read API_URL/isMockMode without
 * an api.ts <-> auth.ts import cycle (api.ts calls into auth.ts for a valid
 * access token on every protected request; auth.ts needs to know where to
 * send its own requests).
 */
export const API_URL = process.env.NEXT_PUBLIC_KOBO_API_URL;

/** True while there's no real backend configured — see NEXT_PUBLIC_KOBO_API_URL in .env.example. */
export function isMockMode() {
  return !API_URL;
}

/**
 * Where a logged-out visitor hitting "/" gets sent (see AuthGate). Currently
 * the waitlist campaign page rather than the marketing landing page — flip
 * this one constant back to "/landing" to revert; nothing else needs to
 * change. Authenticated visitors at "/" are unaffected either way (AuthGate
 * only reads this when there's no session).
 */
export const ROOT_REDIRECT_TARGET = "/waitlist";
