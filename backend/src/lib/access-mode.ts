/**
 * Launch access mode — the single switch between pre-launch waitlist and the
 * live product. Read from `KOBO_ACCESS_MODE` (Railway env). The frontend has
 * its own copy (`NEXT_PUBLIC_KOBO_ACCESS_MODE` on Vercel) that drives route
 * gating; this backend copy only gates public account creation
 * (`POST /auth/signup`) so the API can't be used to bypass the pre-launch gate.
 *
 * Unknown / unset => "waitlist" (fail safe: closed before open).
 */
export type AccessMode = "waitlist" | "live";

export function accessMode(): AccessMode {
  return process.env.KOBO_ACCESS_MODE === "live" ? "live" : "waitlist";
}

export function isWaitlistMode(): boolean {
  return accessMode() === "waitlist";
}
