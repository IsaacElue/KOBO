/**
 * Short "why we hold instead of convert" section — the one idea that makes Kobo
 * different, kept brief for a campaign page. Styling follows the /landing
 * export's cream section + forest ink.
 */
const POINTS = [
  {
    heading: "It lands as USDC, not naira",
    body: "Money arrives on Solana in seconds and stays as digital dollars in your family's wallet — not auto-sold at whatever the rate happens to be that minute.",
  },
  {
    heading: "They convert on their terms",
    body: "Cash out to naira when the rate is good, or when they actually need it. A forced conversion at the wrong moment is a hidden cost most transfers never show you.",
  },
  {
    heading: "Held safely in between",
    body: "Funds sit in the recipient's own wallet with a licensed EMI partner and monthly audits — yours to move, not ours to touch.",
  },
];

export function WhyWeHold() {
  return (
    <section
      id="why"
      className="border-y border-landing-ink/[0.06] bg-landing-surface px-6 py-[84px] sm:px-12"
    >
      <div className="mx-auto max-w-[1000px]">
        <h2 className="max-w-[620px] text-[clamp(1.9rem,4.5vw,2.75rem)] font-bold leading-[1.05] tracking-[-0.03em] text-landing-ink">
          Why we hold instead of convert
        </h2>
        <p className="mt-4 max-w-[560px] text-[17px] leading-[1.55] text-landing-body">
          Every other transfer app races to turn your euros into local currency.
          Kobo doesn&apos;t — and that&apos;s the point.
        </p>

        <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-3">
          {POINTS.map((p, i) => (
            <div key={p.heading}>
              <div className="font-mono text-[13px] font-semibold text-landing-label">
                0{i + 1}
              </div>
              <h3 className="mt-3 text-[17px] font-semibold tracking-tight text-landing-ink">
                {p.heading}
              </h3>
              <p className="mt-2 text-[14.5px] leading-[1.55] text-landing-body">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
