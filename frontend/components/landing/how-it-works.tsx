import type { ReactNode } from "react";
import { Reveal } from "@/components/landing/reveal";

/**
 * The three narrative beats from the Landing export — Send, Arrive, Hold —
 * each a two-column band (copy + a demo card) that stacks on narrow screens.
 * Sample figures (€500 → 539.20 USDC, tx hash, ₦ estimate) are illustrative
 * copy from the design, not live data — this is a marketing page.
 */
export function HowItWorks() {
  return (
    <>
      <SendBand />
      <ArriveBand />
      <HoldBand />
    </>
  );
}

function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`text-[14px] font-semibold tracking-[0.04em] ${className ?? "text-landing-label"}`}
    >
      {children}
    </div>
  );
}

function Band({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={`px-6 py-28 sm:px-12 sm:py-[150px] ${className ?? ""}`}>
      <div className="mx-auto grid max-w-[1200px] items-center gap-14 md:grid-cols-2 md:gap-20">
        {children}
      </div>
    </section>
  );
}

function SendBand() {
  return (
    <Band id="how" className="bg-landing-surface">
      <Reveal>
        <Eyebrow>FROM IRELAND</Eyebrow>
        <h2 className="mt-4 text-[clamp(2rem,4.4vw,3rem)] font-bold leading-[1.08] tracking-[-0.03em] text-landing-ink">
          Leaves your account in seconds, not days.
        </h2>
        <p className="mt-5 max-w-[460px] text-pretty text-[17px] leading-[1.6] text-landing-body">
          Pay in with SEPA Instant straight from your Irish bank. No wire forms,
          no branch visits. Just an amount and a name.
        </p>
      </Reveal>

      <Reveal delay={0.08}>
        <div className="rounded-[32px] bg-gradient-to-br from-landing-sand to-landing-sand-2 p-9 shadow-[0_40px_80px_-50px_rgba(11,31,36,0.4)] sm:p-[52px]">
          <div className="flex items-center justify-between border-b border-landing-ink/[0.08] pb-5">
            <span className="text-[14px] text-[#7b6a45]">You send</span>
            <span className="text-[32px] font-bold tracking-[-0.02em] tabular-nums sm:text-[40px]">
              €500.00
            </span>
          </div>
          <div className="flex justify-center py-5 text-[#b39a5f]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <line x1="12" y1="4" x2="12" y2="20" />
              <polyline points="6,14 12,20 18,14" />
            </svg>
          </div>
          <div className="flex items-center justify-between pt-1.5">
            <span className="text-[14px] text-[#7b6a45]">Your recipient receives</span>
            <span className="text-[32px] font-bold tracking-[-0.02em] text-landing-mint-dark tabular-nums sm:text-[40px]">
              539.20 USDC
            </span>
          </div>
        </div>
      </Reveal>
    </Band>
  );
}

function ArriveBand() {
  return (
    <section
      className="relative overflow-hidden px-6 py-28 text-landing-on-dark sm:px-12 sm:py-[150px]"
      style={{
        background:
          "radial-gradient(circle at 20% 20%, #0F5951 0%, #073F3C 55%, #04231F 100%)",
      }}
    >
      {/* accent glow — a plain overlay, not a negative-z layer: with no
         stacking context on .landing-root a -z-10 child paints behind the
         page's cream background and the whole dark band disappears. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 82% 70%, rgba(30,155,118,.35), transparent 55%)",
        }}
      />
      <div className="relative z-10 mx-auto grid max-w-[1200px] items-center gap-14 md:grid-cols-[1.1fr_1fr] md:gap-20">
        <Reveal>
          <Eyebrow className="text-landing-on-dark/55">SETTLES ON SOLANA</Eyebrow>
          <h2 className="mt-4 text-[clamp(2rem,4.4vw,3rem)] font-bold leading-[1.08] tracking-[-0.03em]">
            Arrives before the kettle boils.
          </h2>
          <p className="mt-5 max-w-[460px] text-pretty text-[17px] leading-[1.6] text-landing-on-dark/70">
            Kobo sends every transfer over Solana. It lands in about a second,
            costs a fraction of a cent, and leaves a record you can check
            yourself.
          </p>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="rounded-[28px] border border-white/[0.12] bg-white/[0.06] p-8 backdrop-blur-sm">
            <div className="flex items-center gap-2.5 text-[13px] tracking-[0.02em] text-landing-on-dark/55">
              <span className="size-2 rounded-full bg-[#1E9B76] shadow-[0_0_0_4px_rgba(30,155,118,0.25)]" />
              Confirmed
            </div>
            <div className="mt-4 font-mono text-[14px] leading-[1.7] break-all text-[#cfebe2]">
              4Rq9k2…eA71pXz9F
            </div>
            <div className="mt-5 grid grid-cols-2 gap-4 border-t border-white/10 pt-5">
              <div>
                <div className="text-[12.5px] text-landing-on-dark/50">Network fee</div>
                <div className="mt-1 font-mono text-[15px]">$0.0002</div>
              </div>
              <div>
                <div className="text-[12.5px] text-landing-on-dark/50">Settlement time</div>
                <div className="mt-1 font-mono text-[15px]">0.6s</div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function HoldBand() {
  return (
    <Band id="hold" className="bg-landing-sand">
      <Reveal>
        <Eyebrow className="text-[#9b8752]">WHY WE HOLD</Eyebrow>
        <h2 className="mt-4 text-[clamp(2rem,4.4vw,3rem)] font-bold leading-[1.08] tracking-[-0.03em] text-landing-ink">
          Not every naira should rush to be spent.
        </h2>
        <p className="mt-5 max-w-[460px] text-pretty text-[17px] leading-[1.6] text-landing-body">
          Most apps convert to naira right away, at whatever rate that hour
          brings. Kobo delivers dollars that keep their value, so your recipient
          can convert when the rate is good and the money is needed.
        </p>
      </Reveal>

      <Reveal delay={0.08}>
        <div className="rounded-[32px] bg-landing-surface p-9 shadow-[0_40px_80px_-50px_rgba(11,31,36,0.35)] sm:p-11">
          <div className="text-[13.5px] font-semibold tracking-[0.04em] text-landing-label">
            YOUR RECIPIENT&apos;S BALANCE
          </div>
          <div className="mt-3.5 text-[44px] font-bold tracking-[-0.03em] tabular-nums">
            539.20{" "}
            <span className="text-[22px] font-medium text-landing-label">USDC</span>
          </div>
          <div className="mt-2 text-[14.5px] text-landing-muted">
            ≈ ₦862,720 today, if they needed it
          </div>
          <div className="mt-6 flex gap-2.5">
            <MiniStat k="Hold" v="Stays in USDC" />
            <MiniStat k="Convert" v="Their call, any day" />
          </div>
        </div>
      </Reveal>
    </Band>
  );
}

function MiniStat({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex-1 rounded-2xl bg-landing-panel p-3.5 text-center">
      <div className="text-[13px] text-landing-label">{k}</div>
      <div className="mt-1 text-[16px] font-semibold">{v}</div>
    </div>
  );
}
