"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KoboApp } from "@/components/kobo/kobo-app";
import { SignupDialog } from "@/components/kobo/signup-dialog";
import { LoginDialog } from "@/components/kobo/login-dialog";
import { PinSetupDialog } from "@/components/kobo/pin-setup-dialog";
import { PinUnlockDialog } from "@/components/kobo/pin-unlock-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { isMockMode } from "@/lib/kobo/config";
import { getStoredAuth, logout, onAuthChange, type StoredAuth } from "@/lib/kobo/auth";

type Phase = "loading" | "signup" | "login" | "pin-setup" | "pin-unlock" | "unlocked";

/* ═══════════════════════════════════════════════════════════════════════════
 *  ⚠️  DEV-ONLY AUTH BYPASS — NEVER ENABLE IN PRODUCTION OR DURING THE DEMO  ⚠️
 *
 *  Companion to the backend's `DEV_SKIP_AUTH` (see backend/src/lib/auth.ts).
 *  When `NEXT_PUBLIC_DEV_SKIP_AUTH=true` (set ONLY in a local, gitignored
 *  `frontend/.env.local` — not `.env.example`, not committed), this skips the
 *  whole login/PIN flow and drops straight into the app as a seeded user,
 *  with a permanent "Dev bypass active" banner so it can never be mistaken
 *  for real auth. Off by default → the real gate below is 100% unchanged.
 *  Fully reversible: remove the env var.
 * ═══════════════════════════════════════════════════════════════════════════ */
const DEV_SKIP_AUTH = process.env.NEXT_PUBLIC_DEV_SKIP_AUTH === "true";

/** Seeded identity for the dev bypass. `id` is the real `users` row id of the
 *  "Isaac Elue" test account (the same seed used for earlier smoke tests), so
 *  balances / transfers / profile all resolve to real data. */
const DEV_BYPASS_USER = { id: "ee2e6c34-a6e5-48a7-bc41-48231bfa2f77", name: "Isaac Elue" };

/**
 * Real-auth gate in front of the app, Revolut-style: first-run is full
 * signup -> set-a-PIN-once; a returning visit with a still-valid persisted
 * session (see lib/kobo/auth.ts's refresh handling) goes straight to a PIN
 * screen instead of full email/password; no session at all (new device,
 * cleared storage, logged out) goes to full login/signup.
 *
 * Mock mode bypasses all of this entirely — there's no real backend to
 * authenticate against, and the existing test suite renders `KoboApp`
 * directly with no gate around it at all, so this has to stay a no-op there.
 *
 * Real-auth, no session: a bare hit on "/" is sent to the marketing landing
 * page ("/landing") rather than straight to a login box. The landing CTAs come
 * back with an `?auth=login` / `?auth=signup` intent, which opens the matching
 * form here instead of redirecting. A valid session is unchanged (→ pin-unlock
 * → KoboApp); mock mode and the dev bypass are untouched.
 */
export function AuthGate() {
  const mock = isMockMode();
  const router = useRouter();
  const searchParams = useSearchParams();
  const authIntent = searchParams.get("auth"); // "login" | "signup" | null
  const [phase, setPhase] = useState<Phase>(mock ? "unlocked" : "loading");
  const [auth, setAuth] = useState<StoredAuth | null>(null);

  useEffect(() => {
    if (mock || DEV_SKIP_AUTH) return;
    const stored = getStoredAuth();
    /* eslint-disable react-hooks/set-state-in-effect -- one-time gate decision
       from a synchronous storage read on mount, not a render loop; same
       category as the fetch-on-mount effects in kobo-app.tsx / activity-screen.tsx */
    if (stored) {
      setAuth(stored);
      setPhase("pin-unlock");
      return;
    }
    // No session. Honour an explicit auth intent from a landing CTA; otherwise
    // bounce to the landing page. `phase` stays "loading" during the redirect.
    if (authIntent === "signup") setPhase("signup");
    else if (authIntent === "login") setPhase("login");
    else router.replace("/landing");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [mock, authIntent, router]);

  // Catches a session dying anywhere else — a 401 from a protected call
  // (lib/kobo/api.ts's handleUnauthorized) or the header's logout button —
  // and bounces back to login, not just whatever triggered it locally. Also
  // picks up a still-valid session being *updated* in place (a Settings
  // profile edit syncs the cached user via updateStoredUser) so the header
  // name refreshes without a reload.
  useEffect(() => {
    if (mock || DEV_SKIP_AUTH) return;
    return onAuthChange(() => {
      const stored = getStoredAuth();
      if (!stored) {
        setAuth(null);
        setPhase((p) => (p === "signup" ? p : "login"));
      } else {
        setAuth(stored);
      }
    });
  }, [mock]);

  if (mock) return <KoboApp />;

  // ⚠️ DEV BYPASS — see the loud comment block at the top of this file. Off by default.
  if (DEV_SKIP_AUTH) {
    return (
      <>
        <DevBypassBanner />
        <KoboApp authUser={DEV_BYPASS_USER} />
      </>
    );
  }

  async function handleLogout() {
    await logout();
    setAuth(null);
    setPhase("login");
  }

  switch (phase) {
    case "loading":
      return (
        <AuthShell>
          <Skeleton className="h-[420px] w-full max-w-sm rounded-[32px]" />
        </AuthShell>
      );
    case "signup":
      return (
        <AuthShell>
          <SignupDialog
            onSuccess={(a) => {
              setAuth(a);
              setPhase("pin-setup");
            }}
            onSwitchToLogin={() => setPhase("login")}
          />
        </AuthShell>
      );
    case "login":
      return (
        <AuthShell>
          <LoginDialog
            onSuccess={(a) => {
              setAuth(a);
              setPhase("unlocked");
            }}
            onSwitchToSignup={() => setPhase("signup")}
          />
        </AuthShell>
      );
    case "pin-setup":
      return (
        <AuthShell>
          <PinSetupDialog onDone={() => setPhase("unlocked")} />
        </AuthShell>
      );
    case "pin-unlock":
      return (
        <AuthShell>
          <PinUnlockDialog
            firstName={auth?.user.name.split(" ")[0] ?? ""}
            onUnlocked={() => setPhase("unlocked")}
            onLogout={handleLogout}
          />
        </AuthShell>
      );
    case "unlocked":
      return <KoboApp authUser={auth?.user} onLogout={handleLogout} />;
  }
}

/** ⚠️ DEV BYPASS banner — unmissable, so a bypassed session is never mistaken for real auth. */
function DevBypassBanner() {
  return (
    <div className="sticky top-0 z-[200] flex items-center justify-center gap-2 border-b-2 border-amber-600 bg-amber-400 px-4 py-2 text-center text-[12.5px] font-bold tracking-tight text-amber-950">
      <span aria-hidden>⚠️</span>
      DEV AUTH BYPASS ACTIVE. Not real authentication. Never enable in production or the demo.
    </div>
  );
}

/**
 * Onboarding ground. The "Kobo Signup" design export puts sign-up/-in on a warm
 * cream surface (distinct from the app's cool gradient shell), so these first-run
 * screens read as onboarding. The PIN gate keeps its own dark treatment inside.
 */
function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-[#FAF7F0] p-6">
      {children}
    </div>
  );
}
