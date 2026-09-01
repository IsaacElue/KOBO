"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Check, Copy, Loader2 } from "lucide-react";
import {
  REFERRAL_TIERS,
  SPOTS_PER_REFERRAL,
  getStoredReferralCode,
  getWaitlistStatus,
  hasEarlyAccess,
  isValidEmail,
  isWaitlistMockMode,
  joinWaitlist,
  resetWaitlist,
} from "@/lib/waitlist/api";
import type { WaitlistStatusResponse } from "@/lib/waitlist/types";

type Joined = { rank: number; referralCode: string } & Partial<WaitlistStatusResponse>;

export function WaitlistPanel() {
  const searchParams = useSearchParams();
  const invitedBy = searchParams.get("ref");

  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<"loading" | "idle" | "submitting" | "joined">("loading");
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<Joined | null>(null);

  // A returning visitor (already joined in this browser) skips straight to the
  // status view. The mock reads it from localStorage; a real backend from a cookie.
  useEffect(() => {
    let alive = true;
    getWaitlistStatus()
      .then((status) => {
        if (!alive) return;
        if (status) {
          setJoined({ ...status, referralCode: getStoredReferralCode() ?? "" });
          setPhase("joined");
        } else {
          setPhase("idle");
        }
      })
      .catch(() => alive && setPhase("idle"));
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
      const res = await joinWaitlist(email);
      const status = await getWaitlistStatus();
      setJoined({ ...res, ...(status ?? {}) });
      setPhase("joined");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setPhase("idle");
    }
  }

  function handleStartOver() {
    resetWaitlist();
    setJoined(null);
    setEmail("");
    setPhase("idle");
  }

  if (phase === "loading") {
    return <div className="h-[220px]" aria-hidden />;
  }

  if (phase === "joined" && joined) {
    return <JoinedState joined={joined} onStartOver={handleStartOver} />;
  }

  return (
    <div className="mx-auto max-w-[480px]">
      {invitedBy && (
        <p className="mb-4 text-[14px] text-landing-muted">
          A friend sent you here. Join below and you&apos;ll both move up.
        </p>
      )}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
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

function JoinedState({ joined, onStartOver }: { joined: Joined; onStartOver: () => void }) {
  const referralCount = joined.referralCount ?? 0;
  const spotsGained = joined.spotsGained ?? 0;
  const earlyAccess = hasEarlyAccess(referralCount);

  const referralUrl = useMemo(() => {
    const base =
      typeof window !== "undefined" ? window.location.origin : "https://kobopayments.com";
    return `${base}/waitlist?ref=${joined.referralCode}`;
  }, [joined.referralCode]);

  return (
    <div className="mx-auto max-w-[520px] text-center">
      <p className="text-[13px] font-semibold tracking-[0.14em] text-landing-label uppercase">
        You&apos;re on the list
      </p>
      <div className="mt-3 font-mono text-[clamp(3rem,12vw,5rem)] leading-none font-bold tracking-[-0.03em] text-landing-ink tabular-nums">
        #{joined.rank.toLocaleString()}
      </div>
      {isWaitlistMockMode() && (
        <p className="mt-2 text-[12.5px] text-landing-label">
          Estimated. Your exact spot is confirmed by email once the list is live.
        </p>
      )}
      <p className="mt-3 text-[15.5px] text-landing-body">
        {spotsGained > 0 ? (
          <>
            You&apos;ve jumped{" "}
            <span className="font-semibold text-landing-ink">{spotsGained.toLocaleString()}</span>{" "}
            spots from {referralCount} referral{referralCount === 1 ? "" : "s"}.
          </>
        ) : (
          <>Share your link to move up the queue.</>
        )}
      </p>

      {earlyAccess && (
        <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#EAF3EE] px-4 py-2 text-[13.5px] font-semibold text-landing-mint-dark">
          <Check className="size-[15px]" strokeWidth={2.4} />
          Early access unlocked
        </p>
      )}

      <div className="mt-8">
        <p className="mb-2 text-left text-[13px] font-semibold tracking-[0.02em] text-landing-label">
          Your referral link
        </p>
        <CopyRow value={referralUrl} />
      </div>

      <div className="mt-8 rounded-2xl border border-landing-ink/[0.08] bg-landing-surface p-6 text-left">
        <p className="text-[14px] font-semibold text-landing-ink">How the queue jump works</p>
        <ul className="mt-3 flex flex-col gap-2 text-[14.5px] text-landing-body">
          {REFERRAL_TIERS.map((tier) => (
            <li key={tier.referrals} className="flex items-start gap-2.5">
              <span
                className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  referralCount >= tier.referrals
                    ? "bg-landing-green text-white"
                    : "bg-landing-sand text-landing-muted"
                }`}
              >
                {referralCount >= tier.referrals ? "✓" : tier.referrals}
              </span>
              <span>
                Refer {tier.referrals}, {tier.reward}
                {tier.unlocksEarlyAccess ? "" : ` (${SPOTS_PER_REFERRAL} per friend)`}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[13px] text-landing-label">
          Early access opens the full app before the public launch.
        </p>
      </div>

      <button
        onClick={onStartOver}
        className="mt-6 text-[13px] font-medium text-landing-label underline underline-offset-4 transition-colors hover:text-landing-muted"
      >
        Use a different email
      </button>
    </div>
  );
}

function CopyRow({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* clipboard blocked; the field is still selectable */
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
  }

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  return (
    <div className="flex items-center gap-2 rounded-full border border-landing-ink/15 bg-landing-surface py-1.5 pr-1.5 pl-5">
      <span className="min-w-0 flex-1 truncate text-left font-mono text-[13.5px] text-landing-muted">
        {value}
      </span>
      <button
        onClick={copy}
        aria-label="Copy referral link"
        className="inline-flex h-[40px] shrink-0 items-center gap-1.5 rounded-full bg-landing-ink px-4 text-[13.5px] font-semibold text-landing-on-dark transition-transform active:scale-[0.97]"
      >
        {copied ? (
          <>
            <Check className="size-[15px]" strokeWidth={2.4} />
            Copied
          </>
        ) : (
          <>
            <Copy className="size-[15px]" strokeWidth={2} />
            Copy
          </>
        )}
      </button>
    </div>
  );
}

