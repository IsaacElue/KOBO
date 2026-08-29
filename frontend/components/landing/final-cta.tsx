import { CtaButton } from "@/components/landing/cta-button";
import { Reveal } from "@/components/landing/reveal";

/** Closing band from the Landing export: forest-green gradient, one CTA. */
export function FinalCta() {
  return (
    <section className="bg-gradient-to-br from-landing-teal to-landing-teal-deep px-6 py-32 text-center text-landing-on-dark sm:px-12 sm:py-[150px]">
      <Reveal>
        <h2 className="mx-auto max-w-[640px] text-[clamp(2.25rem,5.5vw,3.25rem)] font-bold leading-[1.08] tracking-[-0.03em]">
          Send your first euro today.
        </h2>
      </Reveal>
      <Reveal delay={0.06}>
        <p className="mx-auto mt-5 max-w-[460px] text-[17px] text-landing-on-dark/70">
          No card needed to see your rate. Two minutes to your first transfer.
        </p>
      </Reveal>
      <Reveal delay={0.12}>
        <div className="mt-9">
          <CtaButton href="/?auth=signup" variant="inverse">
            Get started
          </CtaButton>
        </div>
      </Reveal>
    </section>
  );
}
