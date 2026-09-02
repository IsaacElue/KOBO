/**
 * Launch access mode — the single switch between the pre-launch waitlist and
 * the live product. One env var, `NEXT_PUBLIC_KOBO_ACCESS_MODE`, read by BOTH
 * `proxy.ts` (server-side route gating) and the client (`AuthGate`,
 * `AccessSync`, `ROOT_REDIRECT_TARGET`).
 *
 *   waitlist  — the public sees only /waitlist. /landing, /, the app, and every
 *               other product route redirect there. Developers (holding a valid
 *               signed access grant) pass through. THIS IS THE DEFAULT — an
 *               unset/unknown value fails safe to waitlist.
 *   live      — normal routing. /landing is the public entry point; / runs its
 *               own auth. The proxy stops gating.
 *
 * It's a `NEXT_PUBLIC_` var, so it is read at build time — flipping it on Vercel
 * triggers a redeploy, which is the intended "launch is a config change, not a
 * code change" flow (see DEPLOYMENT.md).
 */
export type AccessMode = "waitlist" | "live";

export function accessMode(): AccessMode {
  return process.env.NEXT_PUBLIC_KOBO_ACCESS_MODE === "live" ? "live" : "waitlist";
}

export function isWaitlistMode(): boolean {
  return accessMode() === "waitlist";
}

/** The cookie the browser carries the signed developer access grant in. */
export const ACCESS_GRANT_COOKIE = "kobo_access";
