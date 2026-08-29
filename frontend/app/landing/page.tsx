import { LandingHeader } from "@/components/landing/landing-header";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { CoinBand } from "@/components/landing/coin-band";
import { TrustStrip } from "@/components/landing/trust-strip";
import { FinalCta } from "@/components/landing/final-cta";
import { SiteFooter } from "@/components/landing/site-footer";

/**
 * Landing page, rebuilt to the "Kobo Landing (standalone)" design export:
 * sticky nav → hero + four-currency coin row → Send / Arrive / Hold narrative
 * bands (HowItWorks) → mid-page coin beat → trust row → closing CTA → footer.
 *
 * `Infrastructure` / `NetworkMesh` from the previous dark landing are no longer
 * in the composition (the export's story is leaner) — the files are kept, not
 * deleted, in case that section returns.
 */
export default function LandingPage() {
  return (
    <>
      <LandingHeader />
      <main>
        <Hero />
        <HowItWorks />
        <CoinBand />
        <TrustStrip />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
