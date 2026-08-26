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
