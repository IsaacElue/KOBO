/**
 * Short "your money, your timing" section: the one idea that makes Kobo
 * different, framed around the customer benefit and kept brief for an
 * early-access page. Styling follows the /landing export's cream section +
 * forest ink.
 */
const POINTS = [
  {
    heading: "Arrives as digital dollars",
    body: "Money reaches your family's wallet in seconds and holds its value, instead of being sold off at whatever the rate happens to be that minute.",
  },
  {
    heading: "Convert when it makes sense",
    body: "Cash out to naira when the rate is good, or when they actually need it — not on a forced schedule at the wrong moment.",
  },
  {
    heading: "Stay in control",
    body: "Funds stay in your family's own wallet, held with a licensed partner. Yours to move, not ours to touch.",
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
          Your money. Your timing.
        </h2>
        <p className="mt-4 max-w-[560px] text-[17px] leading-[1.55] text-landing-body">
          Your money reaches your family as digital dollars, without being
          automatically converted the moment it arrives.
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
