"use client";

import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  Clock,
  Coins,
  Route,
  Send,
  ShieldCheck,
  Users,
  Wallet,
  Zap,
} from "lucide-react";

/**
 * Overview — a mostly-static product page inside the app (not a separate
 * marketing site), so it uses the same shell, typography, card chrome and
 * palette as every other screen. No backend calls.
 *
 * Content is deliberately scoped to what Kobo actually does today: send +
 * hold, Ireland → Nigeria, real USDC settled on Solana. Off-ramp / cash-out
 * is Phase 2 and is stated as "coming", never implied as live.
 */
export function OverviewScreen({ onStartSend }: { onStartSend: () => void }) {
  return (
    <div className="flex-1 overflow-y-auto p-6 pb-12 sm:p-10">
      <div className="flex max-w-[48rem] flex-col gap-8">
        {/* Hero */}
        <header>
          <Badge className="mb-4 gap-1.5 border-transparent bg-[#F1F6F7] px-3 py-1 text-[12px] font-medium text-kobo-teal-600">
            <Route className="size-3" strokeWidth={2} />
            Ireland → Nigeria
          </Badge>
          <h1 className="mb-3 max-w-2xl text-3xl font-semibold tracking-tight text-kobo-ink sm:text-[34px]">
            Money that moves like a message
          </h1>
          <p className="max-w-2xl text-[15.5px] leading-relaxed text-[#5E7A81]">
            Kobo sends euros from Ireland to Nigeria as USDC — real digital dollars
            landing in your family&apos;s own wallet, usually within about two minutes.
            You hold a balance, add the people you send to, and confirm with a PIN.
          </p>
          <Button
            onClick={onStartSend}
            className="mt-5.5 h-auto gap-2 rounded-full bg-gradient-to-br from-kobo-teal-500 to-kobo-teal-800 px-6 py-3 text-[15px] font-semibold text-kobo-mint-light shadow-lg shadow-kobo-teal-900/40 hover:-translate-y-0.5 hover:opacity-95"
          >
            <Send className="size-[15px]" strokeWidth={2} />
            Send money
          </Button>
        </header>

        {/* What Kobo does */}
        <section>
          <Eyebrow>What Kobo does</Eyebrow>
          <div className="grid gap-4 sm:grid-cols-3">
            <FeatureCard
              icon={<Send className="size-[18px] text-kobo-teal-600" strokeWidth={1.8} />}
              title="Send money"
              body="Pick a saved recipient, enter an amount, confirm with your PIN. No forms, no branch visit."
            />
            <FeatureCard
              icon={<Wallet className="size-[18px] text-kobo-teal-600" strokeWidth={1.8} />}
              title="Hold a balance"
              body="Top up once, then send whenever. Your balance sits in USDC, ready to go."
            />
            <FeatureCard
              icon={<Users className="size-[18px] text-kobo-teal-600" strokeWidth={1.8} />}
              title="Saved recipients"
              body="Add the people you send to by their USDC wallet address once — not every time."
            />
          </div>
        </section>

        {/* How it works */}
        <section>
          <Eyebrow>How it works</Eyebrow>
          <Card className="gap-0 rounded-[28px] border border-white/90 bg-white p-6.5 shadow-[0_24px_50px_-42px_rgba(11,31,36,0.7)] ring-0">
            <Step
              n={1}
              title="Add funds"
              body="Top up by card or bank transfer. Your money is converted to USDC at the live market rate and added to your Kobo balance."
            />
            <Step
              n={2}
              title="Send"
              body="Choose who you're sending to and how much. Kobo moves the USDC on the Solana network and waits for the network to confirm it."
            />
            <Step
              n={3}
              title="They receive"
              body="The USDC lands in a wallet your recipient controls, usually within about two minutes. They hold it directly — it's theirs, not held by Kobo."
              last
            />
            <p className="mt-5 max-w-[62ch] border-t border-kobo-ink/[0.06] pt-4 text-[13.5px] leading-relaxed text-[#7B959B]">
              A 0.53% conversion fee is shown before you confirm. The exchange rate is
              the live market rate — there&apos;s no hidden markup on top of it.
            </p>
          </Card>
        </section>

        {/* Why USDC and Solana */}
        <section>
          <Eyebrow>Why USDC and Solana</Eyebrow>
          <Card className="gap-0 rounded-[28px] border border-white/90 bg-white p-6.5 shadow-[0_24px_50px_-42px_rgba(11,31,36,0.7)] ring-0">
            <Reason
              icon={<Coins className="size-[18px] text-kobo-teal-600" strokeWidth={1.8} />}
              title="USDC is a digital dollar"
              body="One USDC is always worth about one US dollar. It doesn't swing in value the way most crypto does, so the amount you send is the amount that arrives — minus the fee, and nothing else."
            />
            <Reason
              icon={<Zap className="size-[18px] text-kobo-teal-600" strokeWidth={1.8} />}
              title="Solana settles in seconds"
              body="Transfers confirm in seconds and the network fee is a fraction of a cent. That's what makes a two-minute, low-cost transfer possible in the first place."
            />
            <Reason
              icon={<ShieldCheck className="size-[18px] text-kobo-teal-600" strokeWidth={1.8} />}
              title="Your recipient holds it directly"
              body="The USDC arrives in a wallet your recipient controls. Once it's sent, Kobo isn't standing in the middle of their money."
              last
            />
          </Card>
        </section>

        {/* What's coming next */}
        <section>
          <Eyebrow>What&apos;s coming next</Eyebrow>
          <Card className="gap-0 rounded-[28px] border border-white/90 bg-white/70 p-6.5 shadow-[0_24px_50px_-42px_rgba(11,31,36,0.7)] ring-0">
            <Badge className="mb-4 gap-1.5 border-transparent bg-kobo-sand px-3 py-1 text-[12px] font-medium text-kobo-sand-dark">
              <Clock className="size-3" strokeWidth={2} />
              Phase 2 · not available yet
            </Badge>
            <div className="flex flex-col gap-3.5">
              <Upcoming
                title="Cash out to naira"
                body="Converting USDC to Nigerian naira in a bank account or mobile-money wallet. This needs a licensed local partner, and it isn't live yet."
              />
              <Upcoming
                title="More countries"
                body="Ireland to Nigeria is where we're starting. Other corridors will follow once the first one is solid."
              />
              <Upcoming
                title="A recipient app"
                body="So the people receiving money can see their balance in familiar terms, not just as a wallet address."
              />
            </div>
          </Card>
        </section>

        {/* Vision */}
        <section>
          <Eyebrow>Our vision</Eyebrow>
          <Card className="gap-0 rounded-[28px] border-none bg-gradient-to-br from-kobo-teal-500 to-kobo-teal-800 p-7 text-kobo-mint-light shadow-xl shadow-kobo-teal-900/40 ring-0">
            <p className="max-w-2xl text-[15.5px] leading-relaxed">
              Sending money home should feel like sending a message — instant, obvious,
              and built for the person doing it, not the bank in the middle. Kobo is a
              small step toward that: fewer steps, honest fees, and money that shows up
              while it still matters.
            </p>
          </Card>
        </section>

        <p className="text-[13px] leading-relaxed text-[#8AA3A9]">
          Kobo is in active development. Transfers currently settle on Solana&apos;s test
          network while we finalise our launch partners.
        </p>
      </div>
    </div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3.5 text-[11.5px] font-semibold tracking-[0.16em] text-[#8AA3A9] uppercase">
      {children}
    </div>
  );
}

function FeatureCard({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <Card className="gap-0 rounded-[24px] border border-white/90 bg-white p-6 shadow-[0_24px_50px_-42px_rgba(11,31,36,0.7)] ring-0">
      <div className="mb-3.5 flex size-11 items-center justify-center rounded-full bg-[#F1F6F7]">
        {icon}
      </div>
      <h3 className="text-[15.5px] font-semibold tracking-tight text-kobo-ink">{title}</h3>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#7B959B]">{body}</p>
    </Card>
  );
}

function Step({
  n,
  title,
  body,
  last,
}: {
  n: number;
  title: string;
  body: string;
  last?: boolean;
}) {
  return (
    <div className={`flex gap-4 ${last ? "" : "pb-5"}`}>
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-kobo-teal-500 to-kobo-teal-800 text-[13.5px] font-semibold text-kobo-mint-light">
        {n}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-[15px] font-semibold tracking-tight text-kobo-ink">{title}</h3>
        <p className="mt-1 max-w-[62ch] text-[13.5px] leading-relaxed text-[#5E7A81]">{body}</p>
      </div>
    </div>
  );
}

function Reason({
  icon,
  title,
  body,
  last,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  last?: boolean;
}) {
  return (
    <div className={`flex gap-4 ${last ? "" : "mb-5 border-b border-kobo-ink/[0.06] pb-5"}`}>
      <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#F1F6F7]">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-[15px] font-semibold tracking-tight text-kobo-ink">{title}</h3>
        <p className="mt-1 max-w-[62ch] text-[13.5px] leading-relaxed text-[#5E7A81]">{body}</p>
      </div>
    </div>
  );
}

function Upcoming({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex gap-3.5">
      <ArrowRight className="mt-0.5 size-4 shrink-0 text-[#9BB2B8]" strokeWidth={2} />
      <div className="min-w-0 flex-1">
        <h3 className="text-[14.5px] font-semibold tracking-tight text-kobo-ink">{title}</h3>
        <p className="mt-1 max-w-[62ch] text-[13.5px] leading-relaxed text-[#7B959B]">{body}</p>
      </div>
    </div>
  );
}
