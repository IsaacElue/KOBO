"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AppSidebar } from "@/components/kobo/app-sidebar";
import { BottomNav } from "@/components/kobo/bottom-nav";
import { AppHeader } from "@/components/kobo/app-header";
import { DashboardSkeleton } from "@/components/kobo/dashboard-skeleton";
import { SendAmountCard } from "@/components/kobo/send-amount-card";
import { RecipientPicker } from "@/components/kobo/recipient-picker";
import { TransferSummaryPanel } from "@/components/kobo/transfer-summary-panel";
import { PasscodeDialog } from "@/components/kobo/passcode-dialog";
import { UndoGraceDialog } from "@/components/kobo/undo-grace-dialog";
import { AddFundsDialog } from "@/components/kobo/add-funds-dialog";
import { ProcessingOverlay } from "@/components/kobo/processing-overlay";
import { ProcessingChecklist, SEND_PROCESSING_STEPS } from "@/components/kobo/processing-checklist";
import { SuccessDialog } from "@/components/kobo/success-dialog";
import { FailedDialog } from "@/components/kobo/failed-dialog";
import { AddRecipientDialog } from "@/components/kobo/add-recipient-dialog";
import { TransferDetailDialog } from "@/components/kobo/transfer-detail-dialog";
import { ComingSoonPanel } from "@/components/kobo/coming-soon-panel";
import { RecipientsScreen } from "@/components/kobo/recipients-screen";
import { SettingsScreen } from "@/components/kobo/settings-screen";
import { OverviewScreen } from "@/components/kobo/overview-screen";
import { ActivityScreen } from "@/components/kobo/activity-screen";
import { HelpScreen } from "@/components/kobo/help-screen";
import { RedirectHandoff } from "@/components/kobo/onramp/redirect-handoff";
import { EmbeddedWidgetModal } from "@/components/kobo/onramp/embedded-widget-modal";
import { CrossmintCheckoutModal } from "@/components/kobo/onramp/crossmint-checkout-modal";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import {
  AMOUNT_PRESETS,
  CONVERSION_FEE_RATE,
  CURRENCIES,
  CURRENT_USER,
  SEED_RECIPIENTS,
  SUPPORT_EMAIL,
} from "@/lib/kobo/mock-data";
import { koboFxProvider, fxSourceLabel, type FxQuoteResult } from "@/lib/kobo/fx";
import { countryName } from "@/lib/kobo/currencies";
import {
  ACTIVITY_INDEX,
  HELP_INDEX,
  NAV_ITEMS,
  OVERVIEW_INDEX,
  RECIPIENTS_INDEX,
  SEND_MONEY_INDEX,
  SETTINGS_INDEX,
} from "@/lib/kobo/nav";
import {
  createFunding,
  createTransfer,
  getBalance,
  pollFundingStatus,
  pollTransferStatus,
  FUNDING_STATUS_LABEL,
  type ApiError,
} from "@/lib/kobo/api";
import { formatAmount, nameToInitials } from "@/lib/kobo/format";
import { buildHabitSummary } from "@/lib/kobo/habit";
import { loadDefaultCurrency, saveDefaultCurrency } from "@/lib/kobo/preferences";
import { clearOnrampDraft, loadOnrampDraft } from "@/lib/kobo/onramp-draft";
import { preferRedirectOnramp, type TransakBridgeEvent } from "@/lib/kobo/onramp-transak";
import {
  clearFundingRedirect,
  getMoonPayObservedIp,
  isMoonPayWidget,
  loadFundingRedirect,
  onrampPartnerName,
  saveFundingRedirect,
} from "@/lib/kobo/onramp";
import type {
  ActivityTransfer,
  CreateUserResponse,
  CurrencyCode,
  FundingRail,
  FundingStatus,
  OnrampSession,
  Recipient,
  TransferStatus,
} from "@/lib/kobo/types";

type Step = "form" | "passcode" | "undo" | "processing" | "success" | "failed";
type FundingStep = "closed" | "amount" | "onramp" | "processing";

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

export function KoboApp({
  authUser = CURRENT_USER,
  onLogout,
  undoGraceSeconds = 5,
  processingStepMs = 900,
}: {
  /**
   * The signed-in sender — real (`AuthUser` from `POST /auth/signup`/`login`,
   * see `AuthGate`) whenever real auth is in play, or the mock fixture
   * (`CURRENT_USER`) when it isn't. Only `id`/`name` are actually used here;
   * initials/IBAN are always derived from those, never trusted fields on the
   * object itself, so either shape works without a mock-specific branch.
   */
  authUser?: { id: string; name: string };
  /** Omitted in mock mode (AuthGate never renders a real auth shell around mock mode), present in real mode. */
  onLogout?: () => void;
  /**
   * Length of the post-passcode undo grace window. Default 5s (the product spec);
   * tests pass 0 to run straight through to processing without a real wait.
   */
  undoGraceSeconds?: number;
  /**
   * Per-step cadence of the processing checklist, which also sets the minimum
   * time it stays up. Default 900ms (the design handoff); tests shrink it.
   */
  processingStepMs?: number;
} = {}) {
  const minProcessingMs = SEND_PROCESSING_STEPS.length * processingStepMs;
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [navIndex, setNavIndex] = useState(() =>
    searchParams.get("onramp") === "activity" ? ACTIVITY_INDEX : SEND_MONEY_INDEX
  );
  const [tab, setTab] = useState("send");

  const [recipients, setRecipients] = useState<Recipient[]>(() => {
    const draft = loadOnrampDraft();
    if (draft && !draft.completed && !SEED_RECIPIENTS.some((r) => r.id === draft.recipientId)) {
      return [draftRecipient(draft.recipientId, draft.recipient), ...SEED_RECIPIENTS];
    }
    return SEED_RECIPIENTS;
  });
  const [currency, setCurrency] = useState<CurrencyCode>(
    () => loadOnrampDraft()?.currency ?? loadDefaultCurrency() ?? "EUR"
  );
  // Empty by default — not a preset. Seeding a non-zero amount (previously
  // "250") meant that on every load the over-balance check (amount > balance)
  // ran against balance's initial 0 before refreshBalance() resolved, flashing
  // "That's more than your available balance" — permanently so when the real
  // balance was 0. Empty -> amt 0 -> Confirm stays disabled, no false error.
  const [amount, setAmount] = useState(() => loadOnrampDraft()?.amount ?? "");
  const [recipientId, setRecipientId] = useState(() => loadOnrampDraft()?.recipientId ?? SEED_RECIPIENTS[0].id);
  // The EUR/GBP/USD → USDC display quote. `null` = not loaded yet; an
  // `available: false` result = no verified rate (real mode, provider down).
  // Never seeded with a random number — a real-money confirmation screen must
  // not be able to show a mock rate (Sprint 1C Task 7).
  const [fxQuote, setFxQuote] = useState<FxQuoteResult | null>(null);
  const [secsUntilLock, setSecsUntilLock] = useState(RATE_LOCK_SECONDS);
  const [balance, setBalance] = useState(0);

  const [step, setStep] = useState<Step>("form");
  const [code, setCode] = useState("");
  const [undoSecs, setUndoSecs] = useState(undoGraceSeconds);
  const [reference, setReference] = useState("");
  const [failureReason, setFailureReason] = useState<string | null>(null);

  const [addRecipientOpen, setAddRecipientOpen] = useState(false);
  // The transfer whose detail dialog is open (the full ActivityTransfer from
  // getMyTransfers(), handed up by the Overview preview or the Activity list).
  const [detailTransfer, setDetailTransfer] = useState<ActivityTransfer | null>(null);

  const [fundingStep, setFundingStep] = useState<FundingStep>("closed");
  const [fundingAmount, setFundingAmount] = useState("100");
  const [fundingId, setFundingId] = useState("");
  const [fundingStatus, setFundingStatus] = useState<FundingStatus>("pending");
  const [fundingOnrampSession, setFundingOnrampSession] = useState<OnrampSession | null>(null);
  const [fundingOnrampMode, setFundingOnrampMode] = useState<"redirect" | "embedded" | "crossmint" | null>(null);
  // Set once when a MoonPay redirect lands back here; drives the resume poll.
  const [fundingResumeId, setFundingResumeId] = useState<string | null>(null);

  const anyOverlayOpen =
    step !== "form" || addRecipientOpen || detailTransfer !== null || fundingStep !== "closed";

  /**
   * Fetches the display FX quote (`base` → USDC) through the FX abstraction:
   * a verified Transak market quote in real mode, a clearly-tagged mock rate in
   * mock mode. On a real-mode failure the quote becomes `available: false` and
   * the Send screen shows "Rate unavailable" + blocks Confirm rather than
   * silently keeping a stale or fabricated number (Sprint 1C Task 7).
   */
  async function refreshQuote(curr: CurrencyCode) {
    try {
      setFxQuote(await koboFxProvider.getQuote(curr, "USDC"));
    } catch {
      setFxQuote({ available: false, base: curr, quote: "USDC", reason: "provider_error" });
    }
  }

  /** Same silent-retry treatment as refreshRate, for the same reason. */
  async function refreshBalance() {
    try {
      setBalance(await getBalance(authUser.id));
    } catch {
      // keep last known value
    }
  }

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 1100);
    return () => clearTimeout(t);
  }, []);

  // Get the real quote and balance in as soon as possible after mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-time fetch-on-mount, not a render loop
    refreshQuote(currency);
    refreshBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One-time consumption of an onramp draft left behind by a redirect round trip:
  // fire the right toast for how it ended, clean the URL, and discard the draft
  // (its amount/recipient were already used as this component's initial state above).
  useEffect(() => {
    const outcome = searchParams.get("onramp");
    if (outcome === "cancelled") {
      toast("Payment cancelled. Nothing was charged.");
      router.replace("/");
    } else if (outcome === "failed") {
      toast.error("That attempt didn't go through. Your details are still here.");
      router.replace("/");
    } else if (outcome === "activity") {
      router.replace("/");
    }
    const draft = loadOnrampDraft();
    if (draft && !draft.completed) clearOnrampDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // MoonPay opens as a full-tab redirect (its widget is broken/slow in an
  // iframe — see lib/onramp.ts) and returns the user to MOONPAY_REDIRECT_URL
  // with ?transactionId=…&transactionStatus=… appended. Detected once here:
  // pull the id stashed before the redirect, clean the URL, put the overlay
  // back up. transactionStatus is only the "you're back" trigger — the poll
  // below on GET /funding/:id (webhook-driven) is the real completion signal.
  useEffect(() => {
    if (!searchParams.get("transactionStatus")) return;
    const fr = loadFundingRedirect();
    clearFundingRedirect();
    router.replace("/"); // strip the MoonPay params
    if (!fr) return;
    /* eslint-disable react-hooks/set-state-in-effect -- one-time redirect-return resume, same category as the rate/balance fetch above */
    setFundingId(fr.fundingId);
    setFundingAmount(String(fr.amountEur));
    setFundingStep("processing");
    setFundingResumeId(fr.fundingId);
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll to completion. Split from the detection above so it restarts cleanly
  // (React re-runs mount effects; the sessionStorage stash is already consumed
  // by then, so the poll can't hang off a re-read of it).
  useEffect(() => {
    if (!fundingResumeId) return;
    return pollFundingStatus(fundingResumeId, (funding) => {
      setFundingStatus(funding.status);
      if (funding.status === "confirmed") {
        setBalance(funding.balance);
        toast.success(
          `Added ${formatAmount(funding.amount_eur)}. Your balance is now ${funding.balance.toFixed(2)} USDC`
        );
        setFundingStep("closed");
      } else if (funding.status === "failed") {
        toast.error(funding.failure_reason || "Couldn't add funds. Please try again.");
        setFundingStep("closed");
      }
    });
  }, [fundingResumeId]);

  useEffect(() => {
    if (anyOverlayOpen) return;
    const iv = setInterval(() => {
      setSecsUntilLock((s) => {
        if (s <= 1) {
          refreshQuote(currency);
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

  // The verified display rate, or null when we have no trustworthy number.
  const rate = fxQuote?.available ? fxQuote.rate : null;
  const rateAvailable = rate != null && rate > 0;
  const rateSource = fxQuote?.available ? fxQuote.source : null;

  const amt = Math.max(0, parseFloat(amount.replace(/[^\d.]/g, "")) || 0);
  const fee = amt * CONVERSION_FEE_RATE;
  // Every rate-derived figure is null when the rate is unavailable — the UI
  // renders "—" / "Rate unavailable" rather than a fabricated number, and
  // Confirm is blocked below.
  const receiveUsdc = rateAvailable ? (amt - fee) * rate! : null;
  // Real balance is in USDC — converted into the selected currency with the
  // same display rate the header ticker uses (no second rate mechanism).
  const balanceInCurrency = rateAvailable ? balance / rate! : null;

  const sentStr = `${currencyMeta.symbol}${formatAmount(amt)}`;
  const feeStr = `${currencyMeta.symbol}${formatAmount(fee)}`;
  const totalStr = `${currencyMeta.symbol}${formatAmount(amt)}`;
  const receiveStr = receiveUsdc != null ? formatAmount(receiveUsdc) : "—";
  const rateStr = rate != null ? rate.toFixed(4) : "—";
  const balanceStr =
    balanceInCurrency != null ? `${currencyMeta.symbol}${formatAmount(balanceInCurrency)}` : "—";

  function handleCurrencyChange(next: CurrencyCode) {
    setCurrency(next);
    setFxQuote(null);
    refreshQuote(next);
    setSecsUntilLock(RATE_LOCK_SECONDS);
  }

  function openAddFunds() {
    setFundingAmount("100");
    setFundingStep("amount");
  }

  /** Before submitting, a fresh real balance check — insufficient prompts Add Funds instead of the passcode gate. */
  async function handleConfirmClick() {
    // Quote safety: never let a send be confirmed off a rate we can't stand
    // behind (Sprint 1C Task 7). The button is already disabled in this state;
    // this is the belt-and-braces guard.
    if (!rateAvailable || receiveUsdc == null) {
      toast.error("Rate unavailable right now. Please try again in a moment.");
      return;
    }
    let currentBalance = balance;
    try {
      currentBalance = await getBalance(authUser.id);
      setBalance(currentBalance);
    } catch {
      // Fall back to the last known balance for this pre-check — POST /transfers'
      // own INSUFFICIENT_BALANCE check (handled in handleSendConfirm) remains
      // authoritative either way, so a stale pre-check here is a UX nicety, not
      // the real gate.
    }
    if (receiveUsdc > currentBalance) {
      toast.error("Not enough balance. Add funds first.");
      openAddFunds();
      return;
    }
    goPasscode();
  }

  function goPasscode() {
    setCode("");
    setStep("passcode");
  }

  function back() {
    setCode("");
    setStep("form");
  }

  function settleFromTransfer(status: TransferStatus, id: string, failure_reason: string | null) {
    if (status === "confirmed") {
      setStep("success");
      refreshBalance();
    } else if (status === "failed") {
      setFailureReason(failure_reason);
      setStep("failed");
      refreshBalance();
    } else {
      // 'pending' (shouldn't happen post-response) or 'sent' (confirmation
      // timed out, not a failure) — keep polling for the real terminal status.
      pollTransferStatus(id, (transfer) => {
        if (transfer.status === "confirmed") {
          setStep("success");
          refreshBalance();
        } else if (transfer.status === "failed") {
          setFailureReason(transfer.failure_reason);
          setStep("failed");
          refreshBalance();
        }
      });
    }
  }

  // Sending is now instant (balance-checked, no Transak session) — fire here,
  // then poll GET /transfers/:id for real status, same pattern as before. The
  // 3-step processing checklist is on screen throughout; `holdThenRun` keeps it
  // up for at least MIN_PROCESSING_MS so it plays out rather than flashing when
  // the request returns fast (mock mode, or a very quick confirm).
  async function handleSendConfirm() {
    setStep("processing");
    setFailureReason(null);

    const startedAt = Date.now();
    const holdThenRun = (fn: () => void) => {
      const wait = Math.max(0, minProcessingMs - (Date.now() - startedAt));
      if (wait === 0) fn();
      else setTimeout(fn, wait);
    };

    try {
      const res = await createTransfer({
        sender_id: authUser.id,
        recipient_id: recipient.id,
        amount_eur: amt * currencyMeta.eurRate,
      });
      // onramp_reference is always null for an instant-send transfer (it never
      // touches Transak) — falls back to the transfer's real id, same as before.
      const ref = res.onramp_reference || res.id;
      setReference(ref);
      holdThenRun(() => settleFromTransfer(res.status, res.id, res.failure_reason));
    } catch (err) {
      const apiErr = err as ApiError;
      holdThenRun(() => {
        setStep("form");
        if (apiErr.code === "INSUFFICIENT_BALANCE") {
          toast.error("Not enough balance. Add funds first.");
          openAddFunds();
        } else {
          toast.error("Couldn't send. Please try again.");
        }
      });
    }
  }

  /** The undo grace window elapsed uncancelled — the transfer is now really sent. */
  function proceedFromUndo() {
    setStep("processing");
    void handleSendConfirm();
  }

  function cancelUndo() {
    setStep("form");
    setCode("");
    setUndoSecs(undoGraceSeconds);
    toast("Cancelled. Nothing left your account.");
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
      setTimeout(() => {
        if (undoGraceSeconds > 0) {
          setUndoSecs(undoGraceSeconds);
          setStep("undo");
        } else {
          proceedFromUndo();
        }
      }, 220);
    }
  }

  // Undo countdown: one tick per second while the grace window is open; hitting
  // zero broadcasts. Nothing has been sent up to this point, so a cancel here
  // genuinely stops it.
  useEffect(() => {
    if (step !== "undo") return;
    if (undoSecs <= 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fires the real send once the grace window elapses; terminal, not a render loop
      proceedFromUndo();
      return;
    }
    const t = setTimeout(() => setUndoSecs((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, undoSecs]);

  async function handleAddFundsSubmit(amountEur: number, rail: FundingRail) {
    setFundingStep("onramp");
    setFundingOnrampSession(null);
    setFundingAmount(String(amountEur));

    try {
      // Ask MoonPay what IP it sees from this browser, so the backend can lock
      // the widget URL to it only when its own view agrees (see lib/kobo/onramp.ts).
      // Best-effort — null on failure, backend then uses req.ip. Irrelevant for
      // the crossmint rail; the backend ignores it for that rail regardless.
      const clientObservedIp = rail === "moonpay" ? await getMoonPayObservedIp() : null;
      const res = await createFunding({
        sender_id: authUser.id,
        amount_eur: amountEur,
        rail,
        client_observed_ip: clientObservedIp,
      });

      if (rail === "crossmint") {
        if (!res.onramp.checkoutClientSecret || !res.orderId) {
          toast.error("Couldn't start checkout. Please try again.");
          setFundingStep("closed");
          return;
        }
        setFundingId(res.id);
        setFundingOnrampMode("crossmint");
        setFundingOnrampSession(res.onramp);
        return;
      }

      if (!res.onramp.widgetUrl) {
        toast.error("Couldn't start checkout. Please try again.");
        setFundingStep("closed");
        return;
      }
      setFundingId(res.id);
      // MoonPay is always a top-level redirect (its widget is broken/slow in an
      // iframe — see lib/onramp.ts). Transak keeps its width-based choice.
      const mode: "redirect" | "embedded" =
        isMoonPayWidget(res.onramp.widgetUrl) || preferRedirectOnramp() ? "redirect" : "embedded";
      setFundingOnrampMode(mode);
      if (mode === "redirect") {
        // The tab navigates away; stash what the return handler needs to resume.
        saveFundingRedirect({ fundingId: res.id, amountEur });
      }
      setFundingOnrampSession(res.onramp);
    } catch {
      toast.error("Couldn't start checkout. Please try again.");
      setFundingStep("closed");
    }
  }

  // Same principle as the transfer flow: the widget only ever signals "checkout
  // ended," never the real outcome — always poll GET /funding/:id for the truth.
  // (The MoonPay redirect-return path has its own copy of this in the mount
  // effect above, since it resumes before `fundingId` state exists.)
  function finishFundingCheckout(mockOutcome: "confirmed" | "failed") {
    setFundingStep("processing");
    setFundingStatus("pending");
    pollFundingStatus(
      fundingId,
      (funding) => {
        setFundingStatus(funding.status);
        if (funding.status === "confirmed") {
          setBalance(funding.balance);
          toast.success(`Added ${formatAmount(funding.amount_eur)}. Your balance is now ${funding.balance.toFixed(2)} USDC`);
          setFundingStep("closed");
        } else if (funding.status === "failed") {
          toast.error(funding.failure_reason || "Couldn't add funds. Please try again.");
          setFundingStep("closed");
        }
      },
      { mockOutcome }
    );
  }

  function handleFundingTransakEvent(event: TransakBridgeEvent) {
    if (event.kind === "order-successful") {
      finishFundingCheckout("confirmed");
    } else if (event.kind === "order-failed") {
      finishFundingCheckout("failed");
    } else if (event.kind === "widget-closed") {
      setFundingStep("closed");
      toast("Add funds cancelled. Nothing was charged.");
    }
  }

  function reset() {
    setStep("form");
    setCode("");
    setUndoSecs(undoGraceSeconds);
    setSecsUntilLock(RATE_LOCK_SECONDS);
    setFailureReason(null);
  }

  function handleDownloadReceipt() {
    toast.success("Receipt downloaded");
    reset();
  }

  function handleTryAgain() {
    setStep("form");
    setFailureReason(null);
  }

  function handleContactSupport() {
    window.location.href = `mailto:${SUPPORT_EMAIL}`;
  }

  function handleAddRecipient(
    user: CreateUserResponse,
    extra?: { email?: string | null; country?: string | null }
  ) {
    const country = extra?.country ?? user.country ?? null;
    const email = extra?.email ?? null;
    const countryLabel = countryName(country);
    const newRecipient: Recipient = {
      id: user.id,
      name: user.name,
      initials: nameToInitials(user.name),
      meta: countryLabel ? `New recipient · ${countryLabel}` : "New recipient",
      wallet: user.wallet_address,
      lastSent: "No transfers yet",
      email,
      country,
    };
    setRecipients((prev) => [newRecipient, ...prev]);
    setRecipientId(newRecipient.id);
    toast.success(`${user.name} added as a recipient`);
  }

  function handleRemoveRecipient(id: string) {
    if (recipients.length <= 1) {
      toast.error("You need at least one saved recipient.");
      return;
    }
    const removed = recipients.find((r) => r.id === id);
    setRecipients((prev) => {
      const next = prev.filter((r) => r.id !== id);
      if (recipientId === id) setRecipientId(next[0].id);
      return next;
    });
    if (removed) toast.success(`${removed.name} removed`);
  }

  function handleSendToRecipient(id: string) {
    setRecipientId(id);
    setTab("send");
    setNavIndex(SEND_MONEY_INDEX);
  }

  function handleSendAgain(transfer: ActivityTransfer) {
    setCurrency("EUR");
    setAmount(String(transfer.amount_eur));
    setRecipientId(transfer.recipient_id);
    setDetailTransfer(null);
    setTab("send");
    setNavIndex(SEND_MONEY_INDEX);
    toast.success("Details filled in. Review and confirm.");
  }

  const detailRecipient = detailTransfer
    ? (recipients.find((r) => r.id === detailTransfer.recipient_id) ?? null)
    : null;

  return (
    <div className="flex min-h-screen w-full bg-gradient-to-b from-[#DCEDEA] via-kobo-bg to-[#E8F0F1] pb-[calc(3.5rem+env(safe-area-inset-bottom))] text-kobo-ink lg:pb-0">
      <AppSidebar
        activeIndex={navIndex}
        onSelect={setNavIndex}
        balanceLabel={`${currency} BALANCE`}
        balance={balanceStr}
        iban={authUser.id.slice(-4).toUpperCase()}
        onAddFunds={openAddFunds}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          currencyCode={currency}
          rate={rateStr}
          userName={authUser.name}
          userInitials={nameToInitials(authUser.name)}
          onGoToSettings={() => setNavIndex(SETTINGS_INDEX)}
          onGoToHelp={() => setNavIndex(HELP_INDEX)}
          onLogout={onLogout}
        />

        {loading ? (
          <DashboardSkeleton />
        ) : navIndex === RECIPIENTS_INDEX ? (
          <RecipientsScreen
            recipients={recipients}
            onAddNew={() => setAddRecipientOpen(true)}
            onSend={handleSendToRecipient}
            onRemove={handleRemoveRecipient}
          />
        ) : navIndex === SETTINGS_INDEX ? (
          <SettingsScreen
            authUser={authUser}
            onLogout={onLogout}
            defaultCurrency={currency}
            onDefaultCurrencyChange={(next) => {
              handleCurrencyChange(next);
              saveDefaultCurrency(next);
            }}
            onGoToHelp={() => setNavIndex(HELP_INDEX)}
            onManageFunding={openAddFunds}
          />
        ) : navIndex === OVERVIEW_INDEX ? (
          <OverviewScreen
            userName={authUser.name}
            balanceStr={balanceStr}
            rate={rateStr}
            recipients={recipients}
            onStartSend={() => {
              setNavIndex(SEND_MONEY_INDEX);
              setTab("send");
            }}
            onSendAgain={handleSendToRecipient}
            onAddFunds={openAddFunds}
            onViewActivity={() => setNavIndex(ACTIVITY_INDEX)}
            onOpenDetail={setDetailTransfer}
          />
        ) : navIndex === ACTIVITY_INDEX ? (
          <ActivityScreen onOpenDetail={setDetailTransfer} />
        ) : navIndex === HELP_INDEX ? (
          <HelpScreen />
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
                    {currencyMeta.pluralNoun} from your account, USDC in their wallet.
                    Usually within two minutes.
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
                      balance={balanceStr}
                      balanceValue={balanceInCurrency}
                    />
                    <RecipientPicker
                      recipients={recipients}
                      selectedId={recipientId}
                      onSelect={setRecipientId}
                      onAddNew={() => setAddRecipientOpen(true)}
                    />
                  </div>

                  <TransferSummaryPanel
                    recipientName={recipient.name}
                    recipientEmail={recipient.email}
                    recipientCountry={recipient.country}
                    currencyCode={currency}
                    currencySymbol={currencyMeta.symbol}
                    rate={rateStr}
                    rateAvailable={rateAvailable}
                    rateSourceLabel={rateSource ? fxSourceLabel(rateSource) : null}
                    secsUntilLock={secsUntilLock}
                    amountSent={amt}
                    fee={fee}
                    totalStr={totalStr}
                    receiveStr={receiveStr}
                    onConfirm={handleConfirmClick}
                    disabled={
                      amt <= 0 ||
                      !rateAvailable ||
                      (balanceInCurrency != null && amt > balanceInCurrency)
                    }
                  />
                </div>
              </TabsContent>

              <TabsContent value="request">
                <Card className="rounded-[28px] border border-white/90 bg-white/80 p-10 text-center ring-0">
                  <p className="text-[15px] text-[#5E7A81]">
                    Requesting money isn&apos;t available yet. Check back soon.
                  </p>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </main>

      <BottomNav activeIndex={navIndex} onSelect={setNavIndex} />

      <AddRecipientDialog
        open={addRecipientOpen}
        onOpenChange={setAddRecipientOpen}
        onAdd={handleAddRecipient}
      />

      <TransferDetailDialog
        open={detailTransfer !== null}
        onOpenChange={(open) => !open && setDetailTransfer(null)}
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

      <UndoGraceDialog
        open={step === "undo"}
        sentStr={sentStr}
        firstName={firstName}
        secondsRemaining={undoSecs}
        totalSeconds={undoGraceSeconds || 1}
        onCancel={cancelUndo}
      />

      {step === "processing" && (
        <ProcessingChecklist sentStr={sentStr} firstName={firstName} stepMs={processingStepMs} />
      )}

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
        habit={buildHabitSummary(amt, currencyMeta.symbol)}
        onDone={reset}
        onDownloadReceipt={handleDownloadReceipt}
      />

      <FailedDialog
        open={step === "failed"}
        reference={reference}
        reason={failureReason}
        onTryAgain={handleTryAgain}
        onContactSupport={handleContactSupport}
      />

      <AddFundsDialog
        open={fundingStep === "amount"}
        onOpenChange={(open) => !open && setFundingStep("closed")}
        onSubmit={handleAddFundsSubmit}
      />

      {fundingStep === "onramp" && fundingOnrampSession && fundingOnrampMode === "redirect" && (
        <RedirectHandoff
          widgetUrl={fundingOnrampSession.widgetUrl}
          partnerName={onrampPartnerName(fundingOnrampSession.widgetUrl)}
        />
      )}

      {fundingStep === "onramp" && fundingOnrampSession && fundingOnrampMode === "embedded" && (
        <EmbeddedWidgetModal
          embedUrl={fundingOnrampSession.widgetUrl}
          onEvent={handleFundingTransakEvent}
        />
      )}

      {fundingStep === "onramp" && fundingOnrampSession && fundingOnrampMode === "crossmint" && (
        <CrossmintCheckoutModal
          orderId={fundingOnrampSession.sessionId!}
          clientSecret={fundingOnrampSession.checkoutClientSecret!}
          onClose={() => {
            // Row stays pending — no credit ever happens client-side (see
            // onramp-crossmint.test.tsx). A stale-pending sweep is a logged
            // open item, out of scope here.
            setFundingOnrampSession(null);
            setFundingOnrampMode(null);
            setFundingStep("closed");
            toast("Add funds cancelled. Nothing was charged.");
          }}
          onProcessing={() => finishFundingCheckout("confirmed")}
        />
      )}

      <ProcessingOverlay
        open={fundingStep === "onramp" && !fundingOnrampSession}
        label="Preparing checkout"
        sentStr={`€${fundingAmount}`}
        firstName="your balance"
      />

      <ProcessingOverlay
        open={fundingStep === "processing"}
        label={FUNDING_STATUS_LABEL[fundingStatus]}
        sentStr={`€${fundingAmount}`}
        firstName="your balance"
        onDismiss={() => setFundingStep("closed")}
      />
    </div>
  );
}
