import { ShieldCheck, Landmark, KeyRound, BadgeCheck } from "lucide-react";
import { Reveal } from "@/components/landing/reveal";

const ITEMS = [
  { icon: ShieldCheck, label: "Built on Solana" },
  { icon: Landmark, label: "Licensed EMI partner" },
  { icon: KeyRound, label: "256-bit encrypted" },
  { icon: BadgeCheck, label: "Audited monthly" },
];

/** The compact trust row from the Landing export: four claims on a white band. */
export function TrustStrip() {
  return (
    <section
      id="trust"
      className="border-y border-landing-ink/[0.06] bg-landing-surface px-6 py-[70px] sm:px-12"
    >
      <Reveal className="mx-auto flex max-w-[1200px] flex-wrap justify-between gap-8">
        {ITEMS.map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="flex items-center gap-2.5 text-[14.5px] font-medium text-landing-muted"
          >
            <Icon className="size-[17px] shrink-0 text-landing-muted" strokeWidth={1.8} />
            {label}
          </div>
        ))}
      </Reveal>
    </section>
  );
}
