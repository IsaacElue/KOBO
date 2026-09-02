"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { KoboLogo } from "@/components/kobo/kobo-logo";
import { signup, type StoredAuth } from "@/lib/kobo/auth";
import { generatePlaceholderWalletAddress } from "@/lib/kobo/solana";

// Kobo Phase 1 is the Ireland -> Nigeria corridor only (same scoping
// AddRecipientDialog already hardcodes "NG" for every recipient) — a sender
// signing up here is on the Ireland side, so there's no country picker.
const SENDER_COUNTRY = "IE";

export function SignupDialog({
  onSuccess,
  onSwitchToLogin,
}: {
  onSuccess: (auth: StoredAuth) => void;
  onSwitchToLogin: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      setError("Enter your name.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const auth = await signup({
        name: trimmedName,
        email: trimmedEmail,
        password,
        country: SENDER_COUNTRY,
        // Never used for anything a real sender does — see the doc comment
        // on generatePlaceholderWalletAddress for why this is safe to fabricate.
        wallet_address: generatePlaceholderWalletAddress(),
      });
      onSuccess(auth);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create your account. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        className="max-w-sm gap-0 rounded-[32px] border border-white/95 bg-white p-8 pb-7 shadow-[0_60px_110px_-44px_rgba(0,0,0,0.6)] ring-0"
      >
        <form onSubmit={handleSubmit}>
          <KoboLogo variant="mark" priority className="mx-auto mb-5 h-14" />
          <DialogTitle className="text-center text-[30px] font-bold tracking-tight text-kobo-ink">
            Let&apos;s get you sending.
          </DialogTitle>
          <DialogDescription className="mt-2 text-center text-[15.5px] leading-relaxed text-[#5E7A81]">
            An account takes a minute, and we&apos;ll use this to keep it secure.
          </DialogDescription>

          <div className="mt-6 flex flex-col gap-3.5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="signup-name" className="text-sm font-medium text-kobo-ink">
                Name
              </label>
              <Input
                id="signup-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError("");
                }}
                placeholder="e.g. Tomiwa Martins"
                autoComplete="name"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="signup-email" className="text-sm font-medium text-kobo-ink">
                Email
              </label>
              <Input
                id="signup-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError("");
                }}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="signup-password" className="text-sm font-medium text-kobo-ink">
                Password
              </label>
              <Input
                id="signup-password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError("");
                }}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                aria-invalid={!!error}
                aria-describedby={error ? "signup-error" : undefined}
              />
            </div>
            {error && (
              <p id="signup-error" role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>

          <Button
            type="submit"
            disabled={submitting}
            className="mt-6 h-auto w-full rounded-full bg-gradient-to-br from-kobo-teal-500 to-kobo-teal-800 py-3.5 text-[15px] font-semibold text-kobo-mint-light shadow-lg shadow-kobo-teal-900/40 hover:-translate-y-0.5 hover:opacity-95"
          >
            {submitting ? "Creating account…" : "Create account"}
          </Button>

          <button
            type="button"
            onClick={onSwitchToLogin}
            className="mt-4 w-full text-center text-sm text-[#5E7A81] hover:text-kobo-ink"
          >
            Already have an account? <span className="font-medium text-kobo-teal-600">Log in</span>
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
