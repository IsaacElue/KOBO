"use client";

import { useRef } from "react";
import { gsap, useGSAP, SplitText } from "@/lib/gsap";
import { CoinRow } from "@/components/landing/coin-row";
import { CtaButton } from "@/components/landing/cta-button";

/**
 * Hero from the Landing export: centered eyebrow pill, big display headline,
 * one CTA, then the four-currency coin row. The export animates this with a
 * simple rise; we keep the GSAP word-rise the project already had wired (it
 * degrades to a plain render under prefers-reduced-motion).
 */
export function Hero() {
  const rootRef = useRef<HTMLElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);

  useGSAP(
    () => {
      const headline = headlineRef.current;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const supporting = gsap.utils.toArray<HTMLElement>("[data-hero-fade]");
      if (reduced || !headline) return;

      gsap.set(supporting, { opacity: 0, y: 18 });

      let split: SplitText | undefined;
      const run = () => {
        split = SplitText.create(headline, { type: "lines,words", mask: "lines" });
        const tl = gsap.timeline({ delay: 0.1 });
        tl.from(split.words, {
          yPercent: 115,
          opacity: 0,
          duration: 0.85,
          ease: "power4.out",
          stagger: 0.05,
        }).to(
          supporting,
          { opacity: 1, y: 0, duration: 0.7, ease: "power3.out", stagger: 0.1 },
          "-=0.4",
        );
      };

      if (document.fonts?.status === "loaded") run();
      else document.fonts.ready.then(run);

      return () => split?.revert();
    },
    { scope: rootRef },
  );

  return (
    <section
      ref={rootRef}
      className="mx-auto max-w-[1360px] px-6 pt-24 pb-10 text-center sm:px-12"
    >
      <p
        data-hero-fade
        className="inline-flex items-center gap-2 rounded-full bg-[#EAF3EE] px-4 py-2 text-[13px] font-semibold tracking-[0.02em] text-landing-mint-dark"
      >
        Euro in. USDC out. On Solana.
      </p>

      <h1
        ref={headlineRef}
        className="mx-auto mt-7 max-w-[900px] text-[clamp(2.75rem,8vw,4.75rem)] font-bold leading-[0.98] tracking-[-0.035em] text-landing-ink"
      >
        Move value,
        <br />
        not just money.
      </h1>

      <p
        data-hero-fade
        className="mx-auto mt-6 max-w-[560px] text-pretty text-[18px] leading-[1.5] text-landing-body sm:text-[19px]"
      >
        Send euros from Ireland to family in Nigeria as USDC — settled on Solana
        in seconds, and held safely until they choose to convert it.
      </p>

      <div data-hero-fade className="mt-8 flex justify-center">
        <CtaButton href="/">Start sending</CtaButton>
      </div>

      <div data-hero-fade className="mt-16 sm:mt-20">
        <CoinRow />
      </div>
    </section>
  );
}
