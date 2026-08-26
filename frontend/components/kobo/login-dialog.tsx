"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { login, type StoredAuth } from "@/lib/kobo/auth";

export function LoginDialog({
  onSuccess,
  onSwitchToSignup,
}: {
  onSuccess: (auth: StoredAuth) => void;
  onSwitchToSignup: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const auth = await login({ email: email.trim(), password });
      onSuccess(auth);
    } catch (err) {
      // Same generic message the backend itself returns — never reveal
      // whether the email exists or the password was wrong.
      setError(err instanceof Error ? err.message : "Invalid email or password");
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
          <DialogTitle className="text-2xl font-semibold tracking-tight text-kobo-ink">
            Welcome back
          </DialogTitle>
          <DialogDescription className="mt-1.5 text-[14.5px] text-[#5E7A81]">
            Log in to your Kobo account.
          </DialogDescription>

          <div className="mt-6 flex flex-col gap-3.5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="login-email" className="text-sm font-medium text-kobo-ink">
                Email
              </label>
              <Input
                id="login-email"
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
              <label htmlFor="login-password" className="text-sm font-medium text-kobo-ink">
                Password
              </label>
              <Input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError("");
                }}
                placeholder="Your password"
                autoComplete="current-password"
                aria-invalid={!!error}
                aria-describedby={error ? "login-error" : undefined}
              />
            </div>
            {error && (
              <p id="login-error" role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>

          <Button
            type="submit"
            disabled={submitting}
            className="mt-6 h-auto w-full rounded-full bg-gradient-to-br from-kobo-teal-500 to-kobo-teal-800 py-3.5 text-[15px] font-semibold text-kobo-mint-light shadow-lg shadow-kobo-teal-900/40 hover:-translate-y-0.5 hover:opacity-95"
          >
            {submitting ? "Logging in…" : "Log in"}
          </Button>

          <button
            type="button"
            onClick={onSwitchToSignup}
            className="mt-4 w-full text-center text-sm text-[#5E7A81] hover:text-kobo-ink"
          >
            New to Kobo? <span className="font-medium text-kobo-teal-600">Create an account</span>
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
