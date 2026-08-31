"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { SUPPORT_EMAIL } from "@/lib/kobo/mock-data";
import { HelpCircle, Mail, MessageCircle, Plus } from "lucide-react";

/**
 * Help & support — the sixth nav item from the "Kobo Web App" design export:
 * a calm hero, three contact routes, an FAQ accordion and a short contact form.
 * Content (copy, FAQ) is lifted verbatim from the export. No API in the
 * contract backs a support ticket, so submit is acknowledged with a toast.
 */

type Faq = { q: string; a: string };
const FAQ_GROUPS: { title: string; items: Faq[] }[] = [
  {
    title: "Sending",
    items: [
      {
        q: "How long does a transfer take to arrive?",
        a: "Most transfers settle on Solana in under a second. Your recipient will see USDC land in their balance almost as soon as you confirm the send.",
      },
      {
        q: "Can I cancel a transfer after sending it?",
        a: "Once a transfer is confirmed on-chain it can't be reversed, and that's what makes it fast. Double-check the recipient before you confirm.",
      },
      {
        q: "What happens if I enter the wrong wallet address?",
        a: "We check saved recipients against their verified wallet, so this can't happen from your Recipients list. For new wallets, always confirm the address with the recipient first.",
      },
    ],
  },
  {
    title: "Balance & security",
    items: [
      {
        q: "Why do you hold USDC instead of converting to naira automatically?",
        a: "Instant conversion locks in whatever rate that hour brings. Holding USDC lets your recipient choose when to convert, often to their advantage.",
      },
      {
        q: "What if I lose my PIN?",
        a: "Reset it from Settings → Change passcode after verifying your identity again. Your balance stays safe throughout.",
      },
      {
        q: "Is my money insured while it sits as USDC?",
        a: "Funds are held in audited, fully-collateralized USDC. We publish audit results monthly. See Security in Settings.",
      },
    ],
  },
  {
    title: "Fees & limits",
    items: [
      {
        q: "What does Kobo charge per transfer?",
        a: "A small spread built into the rate you see before confirming. No separate fee, no surprise deduction on the other end.",
      },
      {
        q: "Is there a limit on how much I can send?",
        a: "Verified accounts can send up to €15,000 a month. Reach out if you need a higher limit for a specific transfer.",
      },
    ],
  },
];

const TOPICS = ["Sending a transfer", "Balance & security", "Fees & limits", "Other"];

export function HelpScreen({ onGoToFaq }: { onGoToFaq?: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [topic, setTopic] = useState(TOPICS[0]);
  const [message, setMessage] = useState("");

  function submit() {
    toast.success("Message sent. We reply within a few hours");
    setMessage("");
  }

  return (
    <div className="flex-1 overflow-y-auto pb-16">
      <div className="bg-gradient-to-br from-[#EAF3EE] to-[#F6FAFA] px-6 py-16 text-center sm:px-12">
        <h1 className="mb-3 text-3xl font-semibold tracking-tight sm:text-[38px]">
          How can we help?
        </h1>
        <p className="mx-auto max-w-[460px] text-pretty text-[16px] leading-relaxed text-[#5E7A81]">
          Whatever it&apos;s about, we&apos;ll sort it calmly. Your money is safe while we do.
        </p>
      </div>

      <div className="mx-auto max-w-[1100px] px-6 py-11 sm:px-12">
        <div className="grid grid-cols-1 gap-4.5 sm:grid-cols-3">
          <ContactCard
            icon={<MessageCircle className="size-[19px] text-kobo-mint-dark" strokeWidth={1.8} />}
            title="Chat with us"
            sub="Usually replies in under 2 minutes"
            onClick={() => toast("Live chat. A specialist replies in under 2 minutes")}
          />
          <ContactCard
            icon={<Mail className="size-[19px] text-kobo-mint-dark" strokeWidth={1.8} />}
            title="Email support"
            sub={`${SUPPORT_EMAIL} · same-day reply`}
            onClick={() => {
              window.location.href = `mailto:${SUPPORT_EMAIL}`;
            }}
          />
          <ContactCard
            icon={<HelpCircle className="size-[19px] text-kobo-mint-dark" strokeWidth={1.8} />}
            title="Browse the FAQ"
            sub="Sending, security, fees"
            onClick={onGoToFaq ?? (() => toast("The FAQ is right below"))}
          />
        </div>
      </div>

      {FAQ_GROUPS.map((g) => (
        <div key={g.title} className="mx-auto max-w-[820px] px-6 py-6 sm:px-12">
          <div className="mb-4 text-[12px] font-semibold tracking-[0.16em] text-[#8AA3A9]">
            {g.title.toUpperCase()}
          </div>
          <div className="flex flex-col">
            {g.items.map((it) => {
              const isOpen = open === it.q;
              return (
                <button
                  key={it.q}
                  onClick={() => setOpen(isOpen ? null : it.q)}
                  className="border-b border-kobo-ink/[0.07] py-5.5 text-left"
                >
                  <div className="flex items-center justify-between gap-5">
                    <span className="text-[17px] font-medium tracking-[-0.01em] text-kobo-ink">
                      {it.q}
                    </span>
                    <Plus
                      className={cn(
                        "size-4 shrink-0 text-[#5E7A81] transition-transform duration-200",
                        isOpen && "rotate-45",
                      )}
                      strokeWidth={2}
                    />
                  </div>
                  <div
                    className={cn(
                      "grid transition-all duration-250",
                      isOpen ? "mt-3.5 grid-rows-[1fr]" : "grid-rows-[0fr]",
                    )}
                  >
                    <p className="overflow-hidden text-pretty text-[15.5px] leading-relaxed text-[#5E7A81]">
                      {it.a}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="mx-auto max-w-[600px] px-6 pt-8 sm:px-12">
        <Card className="gap-0 rounded-[28px] border border-kobo-ink/[0.05] bg-white p-8 shadow-[0_24px_50px_-38px_rgba(11,31,36,0.75)] ring-0">
          <div className="mb-1 text-[18px] font-semibold tracking-tight text-kobo-ink">
            Still stuck? Write to us.
          </div>
          <p className="mb-5.5 text-[14px] text-[#8AA3A9]">We&apos;ll reply to {SUPPORT_EMAIL}.</p>
          <Select value={topic} onValueChange={(v) => setTopic(v as string)}>
            <SelectTrigger
              aria-label="Topic"
              className="mb-3 h-auto w-full rounded-[14px] border-kobo-ink/[0.12] bg-white px-4 py-3.5 text-[14.5px]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TOPICS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="What's going on?"
            rows={4}
            className="w-full resize-y rounded-[14px] border border-kobo-ink/[0.12] bg-white px-4 py-3.5 text-[14.5px] text-kobo-ink outline-none focus-visible:border-kobo-teal-600"
          />
          <Button
            onClick={submit}
            disabled={!message.trim()}
            className="mt-4 h-auto w-full rounded-full bg-gradient-to-br from-kobo-teal-500 to-kobo-teal-800 py-3.5 text-[15px] font-semibold text-kobo-mint-light hover:opacity-95 disabled:opacity-100 disabled:[background:#AFC4C2]"
          >
            Send message
          </Button>
        </Card>
      </div>
    </div>
  );
}

function ContactCard({
  icon,
  title,
  sub,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-[26px] border border-kobo-ink/[0.05] bg-white p-7 text-left shadow-[0_22px_46px_-38px_rgba(11,31,36,0.75)] transition-all hover:-translate-y-0.5 hover:shadow-[0_30px_52px_-36px_rgba(11,31,36,0.8)]"
    >
      <div className="mb-4 flex size-11 items-center justify-center rounded-[14px] bg-[#DDF2E6]">
        {icon}
      </div>
      <div className="text-[17px] font-semibold tracking-[-0.02em] text-kobo-ink">{title}</div>
      <div className="mt-1.5 text-[13.5px] text-[#8AA3A9]">{sub}</div>
    </button>
  );
}
