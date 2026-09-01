import { describe, expect, test } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TransferDetailDialog } from "@/components/kobo/transfer-detail-dialog";
import type { ActivityTransfer } from "@/lib/kobo/types";

// A syntactically valid base58 Solana signature (no 0/O/I/l), 96 chars.
const REAL_SIG = "3Bxr9TnKfWq2Ap7Ys5Ee8Uu4Mm6Cc1Dd".repeat(3);

function tx(over: Partial<ActivityTransfer> = {}): ActivityTransfer {
  return {
    id: "11111111-2222-4333-8444-555555555555",
    recipient_id: "rcp_1",
    recipient_name: "Adaeze Okonkwo",
    amount_eur: 120,
    amount_usdc: 129.6,
    status: "confirmed",
    solana_tx_signature: null,
    failure_reason: null,
    created_at: new Date(Date.UTC(2026, 7, 20, 13, 58)).toISOString(),
    ...over,
  };
}

function open(transfer: ActivityTransfer) {
  const user = userEvent.setup();
  render(
    <TransferDetailDialog
      open
      onOpenChange={() => {}}
      transfer={transfer}
      recipient={null}
      onSendAgain={() => {}}
    />
  );
  return { user, dialog: screen.getByRole("dialog", { name: /transfer details/i }) };
}

describe("TransferDetailDialog", () => {
  test("prioritises recipient, amount and status", () => {
    const { dialog } = open(tx());
    expect(within(dialog).getByText("Adaeze Okonkwo")).toBeInTheDocument();
    expect(within(dialog).getByText("€120.00")).toBeInTheDocument();
    expect(within(dialog).getByText("Delivered")).toBeInTheDocument();
    expect(within(dialog).getByText("129.60 USDC")).toBeInTheDocument();
  });

  test("no Explorer link for a transfer without a real signature", () => {
    const { dialog } = open(tx({ solana_tx_signature: null }));
    expect(within(dialog).queryByRole("link", { name: /explorer/i })).not.toBeInTheDocument();
  });

  test("no Explorer link for a mock placeholder signature", () => {
    const { dialog } = open(tx({ solana_tx_signature: "mock_sig_txn_2" }));
    expect(within(dialog).queryByRole("link", { name: /explorer/i })).not.toBeInTheDocument();
    // but the placeholder is still copyable
    expect(within(dialog).getByRole("button", { name: /copy transaction hash/i })).toBeInTheDocument();
  });

  test("real signature gets an Explorer link on the devnet cluster", () => {
    const { dialog } = open(tx({ solana_tx_signature: REAL_SIG }));
    const link = within(dialog).getByRole("link", { name: /open in explorer/i });
    expect(link).toHaveAttribute("href", `https://explorer.solana.com/tx/${REAL_SIG}?cluster=devnet`);
  });

  test("the hash is middle-truncated but the full value is available (title + copy)", () => {
    const { dialog } = open(tx({ solana_tx_signature: REAL_SIG }));
    const hashEl = within(dialog).getByTestId("copyable-hash");
    expect(hashEl).toHaveAttribute("title", REAL_SIG);
    expect(hashEl.textContent).not.toEqual(REAL_SIG);
    expect(hashEl.textContent).toContain("…");
    // break-all is the safety net against horizontal overflow
    expect(hashEl).toHaveClass("break-all");
  });

  test("Copy writes the full hash to the clipboard and confirms", async () => {
    const { user, dialog } = open(tx({ solana_tx_signature: REAL_SIG }));
    await user.click(within(dialog).getByRole("button", { name: /copy transaction hash/i }));
    // userEvent installs a clipboard stub on navigator.clipboard for setup()
    expect(await navigator.clipboard.readText()).toBe(REAL_SIG);
    expect(await within(dialog).findByText("Copied")).toBeInTheDocument();
  });

  test("failed transfers surface the failure reason", () => {
    const { dialog } = open(
      tx({ status: "failed", failure_reason: "The chain rejected the transaction." })
    );
    expect(within(dialog).getByText("The chain rejected the transaction.")).toBeInTheDocument();
  });

  test("the dialog content caps its height and hides horizontal overflow", () => {
    const { dialog } = open(tx({ solana_tx_signature: REAL_SIG }));
    expect(dialog).toHaveClass("max-h-[calc(100dvh-2rem)]", "overflow-y-auto", "overflow-x-hidden");
  });
});
