"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import {
  getRememberedSignup,
  isValidEmail,
  joinWaitlist,
  resetWaitlist,
} from "@/lib/waitlist/api";

/**
 * Hero email capture + the post-signup "#N in line" state — the same region,
 * swapped in place. A returning visitor (already signed up in this browser)
 * skips straight to their number.
 *
 * The number is the real `signup_number` from `POST /waitlist/signup` — an
 * exact DB position, not an estimate. No referral system.
 */
export function WaitlistPanel() {
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<"loading" | "idle" | "submitting" | "joined">("loading");
  const [error, setError] = useState<string | null>(null);
  const [signupNumber, setSignupNumber] = useState<number | null>(null);

  // One-shot: does this browser already have a signup? Read it in a microtask
  // callback (not synchronously in the effect body) so the initial "loading"
  // paint stays deterministic on server + client.
  useEffect(() => {
    let alive = true;
    Promise.resolve(getRememberedSignup()).then((remembered) => {
      if (!alive) return;
      if (remembered) {
        setSignupNumber(remembered.signup_number);
        setPhase("joined");
      } else {
        setPhase("idle");
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setError("That doesn't look like an email address.");
      return;
    }
    setError(null);
    setPhase("submitting");
    try {
      const { signup_number } = await joinWaitlist(email);
      setSignupNumber(signup_number);
      setPhase("joined");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setPhase("idle");
    }
  }

  function handleStartOver() {
    resetWaitlist();
    setSignupNumber(null);
    setEmail("");
    setPhase("idle");
  }

  if (phase === "loading") {
    return <div className="h-[220px]" aria-hidden />;
  }

  if (phase === "joined" && signupNumber !== null) {
    return <JoinedState signupNumber={signupNumber} onStartOver={handleStartOver} />;
  }

  return (
    <div className="mx-auto max-w-[480px]">
      {/* noValidate: validation is our own (isValidEmail + the role="alert"
          message) — the native type="email" check would otherwise silently
          block submit before handleSubmit runs. */}
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="waitlist-email" className="sr-only">
          Email address
        </label>
        <input
          id="waitlist-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (error) setError(null);
          }}
          aria-invalid={!!error}
          aria-describedby={error ? "waitlist-error" : undefined}
          className="h-[52px] w-full rounded-full border border-landing-ink/15 bg-landing-surface px-5 text-[16px] text-landing-ink outline-none transition-colors placeholder:text-landing-label focus-visible:border-landing-green focus-visible:ring-2 focus-visible:ring-landing-green/30"
        />
        <button
          type="submit"
          disabled={phase === "submitting"}
          className="inline-flex h-[52px] shrink-0 items-center justify-center gap-2 rounded-full bg-gradient-to-br from-landing-teal to-landing-teal-deep px-7 text-[16px] font-semibold tracking-tight text-[#f2fbf8] shadow-[0_24px_40px_-22px_rgba(8,62,59,0.9)] transition-transform hover:-translate-y-0.5 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-70"
        >
          {phase === "submitting" ? (
            <>
              <Loader2 className="size-[18px] animate-spin" strokeWidth={2.2} />
              Joining
            </>
          ) : (
            <>
              Join the waitlist
              <ArrowRight className="size-[18px]" strokeWidth={2.2} />
            </>
          )}
        </button>
      </form>
      {error && (
        <p id="waitlist-error" role="alert" className="mt-3 text-[14px] text-[#c2410c]">
          {error}
        </p>
      )}
      <p className="mt-4 text-[13.5px] text-landing-label">
        No spam. One email when your spot opens.
      </p>
    </div>
  );
}

function JoinedState({
  signupNumber,
  onStartOver,
}: {
  signupNumber: number;
  onStartOver: () => void;
}) {
  return (
    <div className="mx-auto max-w-[520px] text-center">
      <p className="text-[13px] font-semibold tracking-[0.14em] text-landing-label uppercase">
        You&apos;re on the list
      </p>
      <div className="mt-3 font-mono text-[clamp(3rem,12vw,5rem)] leading-none font-bold tracking-[-0.03em] text-landing-ink tabular-nums">
        #{signupNumber.toLocaleString()}
      </div>

      <p className="mt-4 text-[13.5px] text-landing-label">
        You&apos;re in. We&apos;ll email you the moment early access opens. No spam, just the launch, Thank you!
      </p>

      <button
        onClick={onStartOver}
        className="mt-6 text-[13px] font-medium text-landing-label underline underline-offset-4 transition-colors hover:text-landing-muted"
      >
        Use a different email
      </button>
    </div>
  );
}
