import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import TransferReturnPage from "@/app/transfers/[id]/return/page";
import { saveOnrampDraft } from "@/lib/kobo/onramp-draft";
import type { OnrampDraft } from "@/lib/kobo/onramp-draft";

const baseDraft: OnrampDraft = {
  transferId: "tr_return_test",
  reference: "KB-4242-EU",
  currency: "EUR",
  amount: "250",
  recipientId: "rcp_adaeze",
  recipient: { name: "Adaeze Okonkwo", initials: "AO", wallet: "0x7a3f…C41d" },
  sentStr: "€250.00",
  feeStr: "€1.33",
  receiveStr: "270.76",
  rate: "1.0834",
};

function mockRoute(id: string, search = "") {
  vi.mocked(useParams).mockReturnValue({ id });
  vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams(search) as ReturnType<typeof useSearchParams>);
}

beforeEach(() => {
  sessionStorage.clear();
  mockRoute("tr_return_test");
});

describe("transfer return page", () => {
  test("no matching local session shows the neutral unknown state", async () => {
    mockRoute("tr_never_seen");
    render(<TransferReturnPage />);

    expect(await screen.findByText(/still confirming this transfer/i)).toBeInTheDocument();
    expect(screen.getByText("tr_never_seen")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to activity/i })).toHaveAttribute(
      "href",
      "/?onramp=activity"
    );
  });

  test("a fresh success (no status hint) processes then shows the existing success dialog", async () => {
    saveOnrampDraft(baseDraft);
    render(<TransferReturnPage />);

    expect(await screen.findByRole("status", {}, { timeout: 2000 })).toBeInTheDocument();
    const success = await screen.findByRole(
      "dialog",
      { name: /sent to adaeze/i },
      { timeout: 4000 }
    );
    expect(within(success).getByText("KB-4242-EU")).toBeInTheDocument();
  });

  test("a duplicate visit (already completed) shows success immediately, no processing replay", async () => {
    saveOnrampDraft({ ...baseDraft, completed: true });
    render(<TransferReturnPage />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(
      await screen.findByRole("dialog", { name: /sent to adaeze/i })
    ).toBeInTheDocument();
  });

  test("status=cancelled redirects home with a cancelled flag", async () => {
    saveOnrampDraft(baseDraft);
    mockRoute("tr_return_test", "status=cancelled");
    const replace = vi.fn();
    vi.mocked(useRouter).mockReturnValue({
      push: vi.fn(),
      replace,
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    } as unknown as ReturnType<typeof useRouter>);

    render(<TransferReturnPage />);

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/?onramp=cancelled"));
  });

  test("status=failed shows the failure state with the transfer's reference", async () => {
    saveOnrampDraft(baseDraft);
    mockRoute("tr_return_test", "status=failed");
    render(<TransferReturnPage />);

    const failed = await screen.findByRole("dialog", { name: /payment didn't go through/i });
    expect(within(failed).getByText("KB-4242-EU")).toBeInTheDocument();
  });
});
