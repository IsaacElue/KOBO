"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AppSidebar } from "@/components/kobo/app-sidebar";
import { AppHeader } from "@/components/kobo/app-header";
import { DashboardSkeleton } from "@/components/kobo/dashboard-skeleton";
import { SendAmountCard } from "@/components/kobo/send-amount-card";
import { RecipientPicker } from "@/components/kobo/recipient-picker";
import { RecentTransfers } from "@/components/kobo/recent-transfers";
import { TransferSummaryPanel } from "@/components/kobo/transfer-summary-panel";
import { PasscodeDialog } from "@/components/kobo/passcode-dialog";
import { ProcessingOverlay } from "@/components/kobo/processing-overlay";
import { SuccessDialog } from "@/components/kobo/success-dialog";
import { FailedDialog } from "@/components/kobo/failed-dialog";
import { AddRecipientDialog } from "@/components/kobo/add-recipient-dialog";
import { TransferDetailDialog } from "@/components/kobo/transfer-detail-dialog";
import { ComingSoonPanel } from "@/components/kobo/coming-soon-panel";
import { RedirectHandoff } from "@/components/kobo/onramp/redirect-handoff";
import { EmbeddedWidgetModal } from "@/components/kobo/onramp/embedded-widget-modal";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import {
  AMOUNT_PRESETS,
  BALANCES,
  CONVERSION_FEE_RATE,
  CURRENCIES,
  CURRENT_USER,
  RECIPIENTS,
  SUPPORT_EMAIL,
  TRANSFER_HISTORY,
  randomRate,
} from "@/lib/kobo/mock-data";
import { ACTIVITY_INDEX, NAV_ITEMS, SEND_MONEY_INDEX } from "@/lib/kobo/nav";
import { createTransfer, STATUS_LABEL, watchTransferStatus } from "@/lib/kobo/api";
import { formatAmount } from "@/lib/kobo/format";
import { clearOnrampDraft, loadOnrampDraft, saveOnrampDraft } from "@/lib/kobo/onramp-draft";
import { preferRedirectOnramp, type TransakBridgeEvent } from "@/lib/kobo/onramp-transak";
import type {
  CurrencyCode,
  NewRecipientInput,
  OnrampSession,
  Recipient,
  TransferHistoryItem,
  TransferStatus,
} from "@/lib/kobo/types";

type Step = "form" | "passcode" | "onramp" | "processing" | "success" | "failed";

const RATE_LOCK_SECONDS = 30;

/** Reconstructs a stand-in Recipient from a persisted draft, for a recipient added right before checkout. */
function draftRecipient(recipientId: string, snapshot: { name: string; initials: string; wallet: string }): Recipient {
  return {
    id: recipientId,
    name: snapshot.name,
    initials: snapshot.initials,
    wallet: snapshot.wallet,
    meta: "New recipient · USDC wallet",
    lastSent: "No transfers yet",
  };
}

export function KoboApp() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [navIndex, setNavIndex] = useState(() =>
    searchParams.get("onramp") === "activity" ? ACTIVITY_INDEX : SEND_MONEY_INDEX
  );
  const [tab, setTab] = useState("send");

  const [recipients, setRecipients] = useState<Recipient[]>(() => {
    const draft = loadOnrampDraft();
    if (draft && !draft.completed && !RECIPIENTS.some((r) => r.id === draft.recipientId)) {
      return [draftRecipient(draft.recipientId, draft.recipient), ...RECIPIENTS];
    }
    return RECIPIENTS;
  });
  const [currency, setCurrency] = useState<CurrencyCode>(() => loadOnrampDraft()?.currency ?? "EUR");
  const [amount, setAmount] = useState(() => loadOnrampDraft()?.amount ?? "250");
  const [recipientId, setRecipientId] = useState(() => loadOnrampDraft()?.recipientId ?? RECIPIENTS[0].id);
  const [rate, setRate] = useState(randomRate("EUR"));
  const [secsUntilLock, setSecsUntilLock] = useState(RATE_LOCK_SECONDS);

  const [step, setStep] = useState<Step>("form");
  const [code, setCode] = useState("");
  const [transferStatus, setTransferStatus] = useState<TransferStatus>("pending");
  const [reference, setReference] = useState("");
  const [onrampSession, setOnrampSession] = useState<OnrampSession | null>(null);
  const [onrampMode, setOnrampMode] = useState<"redirect" | "embedded" | null>(null);

  const [addRecipientOpen, setAddRecipientOpen] = useState(false);
  const [detailTransferId, setDetailTransferId] = useState<string | null>(null);

  const anyOverlayOpen = step !== "form" || addRecipientOpen || detailTransferId !== null;

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 1100);
    return () => clearTimeout(t);
  }, []);

  // One-time consumption of an onramp draft left behind by a redirect round trip:
  // fire the right toast for how it ended, clean the URL, and discard the draft
  // (its amount/recipient were already used as this component's initial state above).
  useEffect(() => {
    const outcome = searchParams.get("onramp");
    if (outcome === "cancelled") {
      toast("Payment cancelled — nothing was charged.");
      router.replace("/");
    } else if (outcome === "failed") {
      toast.error("That attempt didn't go through — your details are still here.");
      router.replace("/");
    } else if (outcome === "activity") {
      router.replace("/");
    }
    const draft = loadOnrampDraft();
    if (draft && !draft.completed) clearOnrampDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (anyOverlayOpen) return;
    const iv = setInterval(() => {
      setSecsUntilLock((s) => {
        if (s <= 1) {
          setRate(randomRate(currency));
          return RATE_LOCK_SECONDS;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [anyOverlayOpen, currency]);

  const recipient = recipients.find((r) => r.id === recipientId) ?? recipients[0];
  const firstName = recipient.name.split(" ")[0];
  const currencyMeta = CURRENCIES[currency];

  const amt = Math.max(0, parseFloat(amount.replace(/[^\d.]/g, "")) || 0);
  const fee = amt * CONVERSION_FEE_RATE;
  const receiveUsdc = (amt - fee) * rate;

  const sentStr = `${currencyMeta.symbol}${formatAmount(amt)}`;
  const feeStr = `${currencyMeta.symbol}${formatAmount(fee)}`;
  const receiveStr = formatAmount(receiveUsdc);
  const rateStr = rate.toFixed(4);

  function handleCurrencyChange(next: CurrencyCode) {
    setCurrency(next);
    setRate(randomRate(next));
    setSecsUntilLock(RATE_LOCK_SECONDS);
  }

  function goPasscode() {
    setCode("");
    setStep("passcode");
  }

  function back() {
    setCode("");
    setStep("form");
  }

  function onKeyPress(key: string) {
    if (!key) return;
    if (key === "⌫") {
      setCode((c) => c.slice(0, -1));
      return;
    }
    const next = (code + key).slice(0, 4);
    setCode(next);
    if (next.length === 4) {
      setTimeout(() => startOnramp(), 220);
    }
  }

  async function startOnramp() {
    setStep("onramp");
    setOnrampSession(null);

    function applySession(session: OnrampSession, newTransferId: string, ref: string) {
      if (!session.widgetUrl) {
        toast.error("Couldn't start checkout — please try again.");
        setStep("form");
        return;
      }
      // Frontend decides redirect vs. embedded — the backend always returns one
      // widgetUrl. Redirect leaves the page, so persist enough to resume after.
      const mode = preferRedirectOnramp() ? "redirect" : "embedded";
      if (mode === "redirect") {
        saveOnrampDraft({
          transferId: newTransferId,
          reference: ref,
          currency,
          amount,
          recipientId,
          recipient: { name: recipient.name, initials: recipient.initials, wallet: recipient.wallet },
          sentStr,
          feeStr,
          receiveStr,
          rate: rateStr,
        });
      }
      setOnrampMode(mode);
      setOnrampSession(session);
    }

    try {
      const res = await createTransfer({
        sender_id: CURRENT_USER.id,
        recipient_id: recipient.id,
        amount_eur: amt * currencyMeta.eurRate,
      });
      setReference(res.onramp_reference);
      applySession(res.onramp, res.transfer_id, res.onramp_reference);
    } catch {
      toast.error("Couldn't start checkout — please try again.");
      setStep("form");
    }
  }

  function beginProcessing() {
    setStep("processing");
    setTransferStatus("pending");
    watchTransferStatus((status) => {
      setTransferStatus(status);
      if (status === "confirmed") setStep("success");
    });
  }

  function handleTransakEvent(event: TransakBridgeEvent) {
    if (event.kind === "order-successful") {
      beginProcessing();
    } else if (event.kind === "order-failed") {
      setStep("failed");
    } else if (event.kind === "widget-closed") {
      setStep("form");
      toast("Payment cancelled — nothing was charged.");
    }
  }

  function reset() {
    setStep("form");
    setCode("");
    setSecsUntilLock(RATE_LOCK_SECONDS);
    setOnrampSession(null);
    setOnrampMode(null);
  }

  function handleDownloadReceipt() {
    toast.success("Receipt downloaded");
    reset();
  }

  function handleTryAgain() {
    setStep("form");
    setOnrampSession(null);
    setOnrampMode(null);
  }

  function handleContactSupport() {
    window.location.href = `mailto:${SUPPORT_EMAIL}`;
  }

  function handleAddRecipient(input: NewRecipientInput) {
    const initials = input.name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "NR";
    const newRecipient: Recipient = {
      id: `rcp_${Date.now().toString(36)}`,
      name: input.name,
      initials,
      meta: "New recipient · USDC wallet",
      wallet: input.wallet,
      lastSent: "No transfers yet",
    };
    setRecipients((prev) => [newRecipient, ...prev]);
    setRecipientId(newRecipient.id);
    toast.success(`${input.name} added as a recipient`);
  }

  function handleSendAgain(transfer: TransferHistoryItem) {
    setCurrency("EUR");
    setAmount(String(transfer.amountEur));
    setRecipientId(transfer.recipientId);
    setDetailTransferId(null);
    toast.success("Details filled in — review and confirm.");
  }

  const detailTransfer = TRANSFER_HISTORY.find((h) => h.id === detailTransferId) ?? null;
  const detailRecipient = detailTransfer
    ? (recipients.find((r) => r.id === detailTransfer.recipientId) ?? null)
    : null;

  return (
    <div className="flex min-h-screen w-full bg-gradient-to-b from-[#DCEDEA] via-kobo-bg to-[#E8F0F1] text-kobo-ink">
      <AppSidebar
        activeIndex={navIndex}
        onSelect={setNavIndex}
        balanceLabel={`${currency} BALANCE`}
        balance={`${currencyMeta.symbol}${formatAmount(BALANCES[currency])}`}
        iban={CURRENT_USER.iban}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          currencyCode={currency}
          rate={rateStr}
          userName={CURRENT_USER.name}
          userInitials={CURRENT_USER.initials}
        />

        {loading ? (
          <DashboardSkeleton />
        ) : navIndex !== SEND_MONEY_INDEX ? (
          <ComingSoonPanel
            label={NAV_ITEMS[navIndex]}
            onBack={() => setNavIndex(SEND_MONEY_INDEX)}
          />
        ) : (
          <div className="flex-1 overflow-y-auto p-6 pb-10 sm:p-10">
            <Tabs value={tab} onValueChange={(v) => setTab(v as string)}>
              <div className="mb-6.5 flex flex-wrap items-end justify-between gap-6">
                <div>
                  <h1 className="mb-2 text-3xl font-semibold tracking-tight sm:text-[34px]">
                    Send money home
                  </h1>
                  <p className="max-w-xl text-[15.5px] text-[#5E7A81]">
                    {currencyMeta.pluralNoun} from your account, USDC in their wallet — usually
                    within two minutes.
                  </p>
                </div>
                <TabsList variant="line" className="h-auto gap-2.5 bg-transparent p-0">
                  <TabsTrigger
                    value="send"
                    className="h-auto rounded-full border border-kobo-ink/10 bg-white/75 px-5 py-2.5 text-[14.5px] font-medium text-[#33565E] data-active:border-transparent data-active:bg-gradient-to-br data-active:from-kobo-teal-500 data-active:to-kobo-teal-800 data-active:text-kobo-mint-light data-active:shadow-none"
                  >
                    Send
                  </TabsTrigger>
                  <TabsTrigger
                    value="request"
                    className="h-auto rounded-full border border-kobo-ink/10 bg-white/75 px-5 py-2.5 text-[14.5px] font-medium text-[#33565E] data-active:border-transparent data-active:bg-gradient-to-br data-active:from-kobo-teal-500 data-active:to-kobo-teal-800 data-active:text-kobo-mint-light data-active:shadow-none"
                  >
                    Request
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="send">
                <div className="grid grid-cols-1 items-start gap-6.5 xl:grid-cols-[minmax(440px,1.35fr)_minmax(360px,0.9fr)]">
                  <div className="flex flex-col gap-5.5">
                    <SendAmountCard
                      amount={amount}
                      onAmountChange={setAmount}
                      currency={currency}
                      onCurrencyChange={handleCurrencyChange}
                      presets={AMOUNT_PRESETS}
                      onPickPreset={(v) => setAmount(String(v))}
                      balance={`${currencyMeta.symbol}${formatAmount(BALANCES[currency])}`}
                    />
                    <RecipientPicker
                      recipients={recipients}
                      selectedId={recipientId}
                      onSelect={setRecipientId}
                      onAddNew={() => setAddRecipientOpen(true)}
                    />
                    <RecentTransfers
                      history={TRANSFER_HISTORY}
                      recipients={recipients}
                      onSelect={(item) => setDetailTransferId(item.id)}
                    />
                  </div>

                  <TransferSummaryPanel
                    currencyCode={currency}
                    currencySymbol={currencyMeta.symbol}
                    rate={rateStr}
                    secsUntilLock={secsUntilLock}
                    amountSent={amt}
                    fee={fee}
                    receiveUsdc={receiveUsdc}
                    onConfirm={goPasscode}
                  />
                </div>
              </TabsContent>

              <TabsContent value="request">
                <Card className="rounded-[28px] border border-white/90 bg-white/80 p-10 text-center ring-0">
                  <p className="text-[15px] text-[#5E7A81]">
                    Requesting money isn&apos;t available yet — check back soon.
                  </p>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </main>

      <AddRecipientDialog
        open={addRecipientOpen}
        onOpenChange={setAddRecipientOpen}
        onAdd={handleAddRecipient}
      />

      <TransferDetailDialog
        open={detailTransferId !== null}
        onOpenChange={(open) => !open && setDetailTransferId(null)}
        transfer={detailTransfer}
        recipient={detailRecipient}
        onSendAgain={handleSendAgain}
      />

      <PasscodeDialog
        open={step === "passcode"}
        code={code}
        firstName={firstName}
        sentStr={sentStr}
        receiveStr={receiveStr}
        onKeyPress={onKeyPress}
        onBack={back}
      />

      {step === "onramp" && onrampSession && onrampMode === "redirect" && (
        <RedirectHandoff widgetUrl={onrampSession.widgetUrl} />
      )}

      {step === "onramp" && onrampSession && onrampMode === "embedded" && (
        <EmbeddedWidgetModal embedUrl={onrampSession.widgetUrl} onEvent={handleTransakEvent} />
      )}

      <ProcessingOverlay
        open={step === "onramp" && !onrampSession}
        label="Preparing checkout"
        sentStr={sentStr}
        firstName={firstName}
      />

      <ProcessingOverlay
        open={step === "processing"}
        label={STATUS_LABEL[transferStatus]}
        sentStr={sentStr}
        firstName={firstName}
      />

      <SuccessDialog
        open={step === "success"}
        recipient={recipient}
        firstName={firstName}
        currencyCode={currency}
        sentStr={sentStr}
        receiveStr={receiveStr}
        feeStr={feeStr}
        rate={rateStr}
        reference={reference}
        onDone={reset}
        onDownloadReceipt={handleDownloadReceipt}
      />

      <FailedDialog
        open={step === "failed"}
        reference={reference}
        onTryAgain={handleTryAgain}
        onContactSupport={handleContactSupport}
      />
    </div>
  );
}
