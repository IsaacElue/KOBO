"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ProcessingOverlay } from "@/components/kobo/processing-overlay";
import { SuccessDialog } from "@/components/kobo/success-dialog";
import { FailedDialog } from "@/components/kobo/failed-dialog";
import { Button } from "@/components/ui/button";
import { pollTransferStatus, STATUS_LABEL } from "@/lib/kobo/api";
import { SUPPORT_EMAIL } from "@/lib/kobo/mock-data";
import {
  clearOnrampDraft,
  loadOnrampDraft,
  markOnrampDraftCompleted,
  type OnrampDraft,
} from "@/lib/kobo/onramp-draft";
import type { TransferStatus } from "@/lib/kobo/types";

type Phase = "checking" | "processing" | "success" | "cancelled" | "failed" | "unknown";

function TransferReturn() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const transferId = params.id;
  // Optional hint from the redirect URL Transak was configured with - absent means
  // "assume success, but verify" rather than assuming anything.
  const statusHint = searchParams.get("status");

  // Everything here is derivable synchronously from sessionStorage + the URL at mount,
  // so it's computed once as initial state rather than set from inside an effect.
  const [draft] = useState<OnrampDraft | null>(() => {
    const stored = loadOnrampDraft();
    return stored && stored.transferId === transferId ? stored : null;
  });
  const [phase, setPhase] = useState<Phase>(() => {
    if (!draft) return "unknown";
    if (draft.completed) return "success";
    if (statusHint === "cancelled") return "cancelled";
    if (statusHint === "failed") return "failed";
    return "processing";
  });
  const [transferStatus, setTransferStatus] = useState<TransferStatus>(() =>
    draft?.completed ? "confirmed" : "pending"
  );
  const [failureReason, setFailureReason] = useState<string | null>(null);

  // Polls the real backend status only while actively confirming - setState here
  // happens inside the poll callback, not the effect body. This is the same signal
  // GET /transfers/:id gives the embedded flow; a client-side postMessage/redirect
  // signal is never enough on its own to claim success.
  useEffect(() => {
    if (phase !== "processing" || !draft) return;
    return pollTransferStatus(draft.transferId, (transfer) => {
      setTransferStatus(transfer.status);
      if (transfer.status === "confirmed") {
        markOnrampDraftCompleted();
        setPhase("success");
      } else if (transfer.status === "failed") {
        setFailureReason(transfer.failure_reason);
        setPhase("failed");
      }
    });
  }, [phase, draft]);

  useEffect(() => {
    if (phase === "cancelled") router.replace("/?onramp=cancelled");
  }, [phase, router]);

  function goHome() {
    clearOnrampDraft();
    router.push("/");
  }

  function tryAgain() {
    // The draft is left in place on purpose - the home page restores amount + recipient from it.
    router.push("/");
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-b from-[#DCEDEA] via-kobo-bg to-[#E8F0F1] p-6">
      <ProcessingOverlay
        open={phase === "processing"}
        label={STATUS_LABEL[transferStatus]}
        sentStr={draft?.sentStr ?? ""}
        firstName={draft?.recipient.name.split(" ")[0] ?? ""}
      />

      {draft && (
        <SuccessDialog
          open={phase === "success"}
          recipient={draft.recipient}
          firstName={draft.recipient.name.split(" ")[0]}
          currencyCode={draft.currency}
          sentStr={draft.sentStr}
          receiveStr={draft.receiveStr}
          feeStr={draft.feeStr}
          rate={draft.rate}
          reference={draft.reference}
          onDone={goHome}
          onDownloadReceipt={goHome}
        />
      )}

      <FailedDialog
        open={phase === "failed"}
        reference={draft?.reference ?? transferId}
        reason={failureReason}
        onTryAgain={tryAgain}
        onContactSupport={() => (window.location.href = `mailto:${SUPPORT_EMAIL}`)}
      />

      {phase === "unknown" && (
        <div className="max-w-sm rounded-[28px] border border-white/90 bg-white/90 p-8 text-center shadow-xl">
          <div className="text-lg font-semibold text-kobo-ink">
            We&apos;re still confirming this transfer
          </div>
          <p className="mt-2 text-[14.5px] text-[#5E7A81]">
            Reference <span className="font-mono text-kobo-ink">{transferId}</span>. We couldn&apos;t
            find this checkout on this device — check Activity for the latest status.
          </p>
          <Button
            render={<Link href="/?onramp=activity" />}
            className="mt-5 h-auto rounded-full bg-gradient-to-br from-kobo-teal-500 to-kobo-teal-800 px-6 py-2.5 text-kobo-mint-light hover:opacity-95"
          >
            Back to Activity
          </Button>
        </div>
      )}
    </div>
  );
}

export default function TransferReturnPage() {
  return (
    <Suspense>
      <TransferReturn />
    </Suspense>
  );
}
