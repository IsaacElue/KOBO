import { Reveal } from "@/components/landing/reveal";
import { MorphingCoin } from "@/components/landing/morphing-coin";

/**
 * A quiet mid-page beat. The Landing export shows a static four-coin row in the
 * hero; here we keep the project's GSAP single-coin build (euro → USDC → $ → ₦,
 * settling on USDC) as the live, interactive treatment of the same motif. When
 * the Spline/3D coin is ready it can replace <MorphingCoin/> here and in the
 * hero's <CoinRow/> — the layout it needs is: centered, ~360px, on cream.
 */
export function CoinBand() {
  return (
    <section className="bg-landing-bg px-6 py-28 text-center sm:py-36">
      <Reveal className="flex justify-center">
        <MorphingCoin />
      </Reveal>
      <Reveal delay={0.08}>
        <p className="mx-auto mt-10 max-w-[20ch] text-balance text-[clamp(1.8rem,4.6vw,3rem)] font-bold leading-[1.08] tracking-[-0.02em] text-landing-ink">
          It lands as dollars. And it stays dollars.
        </p>
      </Reveal>
    </section>
  );
}
