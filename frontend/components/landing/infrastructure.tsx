import { NetworkMesh } from "@/components/landing/network-mesh";
import { Reveal } from "@/components/landing/reveal";

const FACTS = [
  { v: "~2 min", k: "typical settlement" },
  { v: "< $0.01", k: "network fee" },
  { v: "24 / 7", k: "no bank cut-off" },
];

export function Infrastructure() {
  return (
    <section className="relative overflow-hidden bg-landing-bg-2 py-32 sm:py-40">
      {/* faint node mesh, masked so the centre stays readable */}
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <NetworkMesh />
      </div>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 55% at 50% 45%, var(--landing-bg-2) 8%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-2xl px-6 text-center">
        <Reveal>
          <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-landing-mist">
            Why Solana
          </p>
        </Reveal>
        <Reveal delay={0.05}>
          <h2 className="mx-auto mt-6 max-w-[16ch] text-balance font-[family-name:var(--font-display)] text-[clamp(2rem,5.2vw,3.6rem)] font-semibold leading-[1.06] text-landing-cream">
            Built on rails that actually settle.
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mx-auto mt-7 max-w-[48ch] text-[17px] leading-relaxed text-landing-mist">
            Solana confirms a transfer in seconds and costs a fraction of a cent
            to use. That isn&apos;t a marketing detail. It&apos;s the reason a
            two-minute, low-fee transfer from Dublin to Lagos is possible at all.
            The money doesn&apos;t sit in a correspondent bank for three days. It
            arrives on-chain, and it&apos;s final.
          </p>
        </Reveal>

        <Reveal delay={0.15}>
          <div className="mx-auto mt-14 flex max-w-md flex-wrap items-baseline justify-center gap-x-10 gap-y-4 border-t border-landing-line pt-8 font-mono">
            {FACTS.map((f) => (
              <div key={f.k} className="text-center">
                <div className="text-[19px] text-landing-mint">{f.v}</div>
                <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-landing-mist/80">
                  {f.k}
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
