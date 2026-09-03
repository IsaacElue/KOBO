import { Suspense } from "react";
import { WaitlistHeader } from "@/components/waitlist/waitlist-header";
import { WaitlistPanel } from "@/components/waitlist/waitlist-panel";
import { WhyWeHold } from "@/components/waitlist/why-we-hold";
import { SiteFooter } from "@/components/landing/site-footer";

/**
 * /waitlist: standalone post-Demo-Day campaign page. Not linked from the app,
 * the landing page, or AuthGate; driven entirely by external campaign links.
 *
 * Hero email capture and the post-signup "#N" state are the same region:
 * `WaitlistPanel` swaps between them (and restores the signed-up state for a
 * returning visitor). The number comes from `POST /waitlist/signup` — see
 * lib/waitlist/api.ts.
 */
export default function WaitlistPage() {
  return (
    <>
      <WaitlistHeader />

      <main>
        <section className="mx-auto max-w-[1000px] px-6 pt-16 pb-20 text-center sm:px-12 sm:pt-24">
          <p className="inline-flex items-center gap-2 rounded-full bg-[#EAF3EE] px-4 py-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-landing-mint-dark">
            Early access · joining now
          </p>

          <h1 className="mx-auto mt-7 max-w-[760px] text-[clamp(2.5rem,7vw,4.25rem)] font-bold leading-[1] tracking-[-0.035em] text-landing-ink">
            Be first in line.
          </h1>

          <p className="mx-auto mt-6 max-w-[560px] text-pretty text-[clamp(1.25rem,3vw,1.6rem)] font-semibold leading-[1.25] tracking-[-0.02em] text-landing-ink">
            Send money home without the wait.
          </p>

          <p className="mx-auto mt-4 max-w-[520px] text-pretty text-[18px] leading-[1.5] text-landing-body">
            Kobo is building a faster, simpler way to send money from Ireland to
            Nigeria. Join the early-access list and be first to try it.
          </p>

          <div className="mt-10">
            <Suspense fallback={<div className="h-[220px]" aria-hidden />}>
              <WaitlistPanel />
            </Suspense>
          </div>
        </section>

        <WhyWeHold />
      </main>

      <SiteFooter />
    </>
  );
}
