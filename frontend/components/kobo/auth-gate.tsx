"use client";

import { useEffect, useState, type ReactNode } from "react";
import { KoboApp } from "@/components/kobo/kobo-app";
import { SignupDialog } from "@/components/kobo/signup-dialog";
import { LoginDialog } from "@/components/kobo/login-dialog";
import { PinSetupDialog } from "@/components/kobo/pin-setup-dialog";
import { PinUnlockDialog } from "@/components/kobo/pin-unlock-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { isMockMode } from "@/lib/kobo/config";
import { getStoredAuth, logout, onAuthChange, type StoredAuth } from "@/lib/kobo/auth";

type Phase = "loading" | "signup" | "login" | "pin-setup" | "pin-unlock" | "unlocked";

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
 */
export function AuthGate() {
  const mock = isMockMode();
  const [phase, setPhase] = useState<Phase>(mock ? "unlocked" : "loading");
  const [auth, setAuth] = useState<StoredAuth | null>(null);

  useEffect(() => {
    if (mock) return;
    const stored = getStoredAuth();
    if (stored) {
      setAuth(stored);
      setPhase("pin-unlock");
    } else {
      setPhase("login");
    }
  }, [mock]);

  // Catches a session dying anywhere else — a 401 from a protected call
  // (lib/kobo/api.ts's handleUnauthorized) or the header's logout button —
  // and bounces back to login, not just whatever triggered it locally.
  useEffect(() => {
    if (mock) return;
    return onAuthChange(() => {
      if (!getStoredAuth()) {
        setAuth(null);
        setPhase((p) => (p === "signup" ? p : "login"));
      }
    });
  }, [mock]);

  if (mock) return <KoboApp />;

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

/** Same app-shell gradient KoboApp itself uses, so the auth screens read as part of the app, not a separate marketing page. */
function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-b from-[#DCEDEA] via-kobo-bg to-[#E8F0F1] p-6">
      {children}
    </div>
  );
}
