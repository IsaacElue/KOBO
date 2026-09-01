import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TransferHistory } from "@/components/kobo/transfer-history";
import type { ActivityTransfer, TransferHistoryPage, TransferHistoryQuery } from "@/lib/kobo/types";

const { getTransferHistory } = vi.hoisted(() => ({ getTransferHistory: vi.fn() }));
vi.mock("@/lib/kobo/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/kobo/api")>();
  return { ...actual, getTransferHistory };
});

function tx(over: Partial<ActivityTransfer> = {}): ActivityTransfer {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    recipient_id: "rcp_1",
    recipient_name: "Adaeze Okonkwo",
    amount_eur: 200,
    amount_usdc: 216,
    status: "confirmed",
    solana_tx_signature: null,
    failure_reason: null,
    created_at: new Date(Date.UTC(2026, 7, 20)).toISOString(),
    ...over,
  };
}

/** A stateful fake server over a fixed list — honours q, group and offset/limit. */
function fakeServer(all: ActivityTransfer[]) {
  return async (query: TransferHistoryQuery = {}): Promise<TransferHistoryPage> => {
    const limit = query.limit ?? 10;
    const offset = query.offset ?? 0;
    let rows = all;
    if (query.group === "delivered") rows = rows.filter((t) => t.status === "confirmed");
    if (query.group === "failed") rows = rows.filter((t) => t.status === "failed");
    if (query.group === "pending")
      rows = rows.filter((t) => ["pending", "onramp_complete", "sent"].includes(t.status));
    if (query.q) {
      const q = query.q.toLowerCase();
      rows = rows.filter(
        (t) =>
          (t.recipient_name ?? "").toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q) ||
          (t.solana_tx_signature ?? "").toLowerCase().includes(q)
      );
    }
    const page = rows.slice(offset, offset + limit);
    return { transfers: page, total: rows.length, limit, offset, has_more: offset + page.length < rows.length };
  };
}

function renderHistory() {
  const onOpenDetail = vi.fn();
  const user = userEvent.setup();
  render(<TransferHistory onOpenDetail={onOpenDetail} />);
  return { user, onOpenDetail };
}

beforeEach(() => {
  getTransferHistory.mockReset();
});

describe("TransferHistory", () => {
  test("renders rows from the API", async () => {
    getTransferHistory.mockImplementation(
      fakeServer([tx({ id: "a", recipient_name: "Adaeze Okonkwo" }), tx({ id: "b", recipient_name: "Chidi Balogun" })])
    );
    renderHistory();

    expect(await screen.findByText("Adaeze Okonkwo")).toBeInTheDocument();
    expect(screen.getByText("Chidi Balogun")).toBeInTheDocument();
    expect(getTransferHistory).toHaveBeenCalledWith(expect.objectContaining({ offset: 0 }));
  });

  test("shows a loading state before the first page resolves", async () => {
    let resolve!: (p: TransferHistoryPage) => void;
    getTransferHistory.mockReturnValue(new Promise((r) => (resolve = r)));
    renderHistory();

    // skeletons render (no rows, no empty-state copy yet)
    expect(screen.queryByText(/no transfers/i)).not.toBeInTheDocument();
    resolve({ transfers: [tx()], total: 1, limit: 10, offset: 0, has_more: false });
    expect(await screen.findByText("Adaeze Okonkwo")).toBeInTheDocument();
  });

  test("empty state when the account has no transfers", async () => {
    getTransferHistory.mockImplementation(fakeServer([]));
    renderHistory();
    expect(await screen.findByText(/no transfers yet/i)).toBeInTheDocument();
  });

  test("error state with a retry that refetches", async () => {
    getTransferHistory.mockRejectedValueOnce(new Error("boom"));
    getTransferHistory.mockImplementation(fakeServer([tx()]));
    const { user } = renderHistory();

    await user.click(await screen.findByRole("button", { name: /try again/i }));
    expect(await screen.findByText("Adaeze Okonkwo")).toBeInTheDocument();
  });

  test("search filters the list and shows a distinct no-matches empty state", async () => {
    getTransferHistory.mockImplementation(
      fakeServer([
        tx({ id: "a", recipient_name: "Adaeze Okonkwo" }),
        tx({ id: "b", recipient_name: "Chidi Balogun" }),
      ])
    );
    const { user } = renderHistory();
    await screen.findByText("Adaeze Okonkwo");

    const box = () => screen.getByRole("searchbox", { name: /search transfers/i });
    await user.type(box(), "chidi");
    await waitFor(() =>
      expect(screen.queryByText("Adaeze Okonkwo")).not.toBeInTheDocument()
    );
    expect(screen.getByText("Chidi Balogun")).toBeInTheDocument();
    expect(getTransferHistory).toHaveBeenCalledWith(expect.objectContaining({ q: "chidi" }));

    await user.clear(box());
    await user.type(box(), "nobody-here");
    expect(await screen.findByText(/no transfers match/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /show all transfers/i }));
    expect(await screen.findByText("Adaeze Okonkwo")).toBeInTheDocument();
  });

  test("status filter narrows to the chosen group", async () => {
    getTransferHistory.mockImplementation(
      fakeServer([
        tx({ id: "a", recipient_name: "Delivered One", status: "confirmed" }),
        tx({ id: "b", recipient_name: "Failed One", status: "failed", failure_reason: "nope" }),
      ])
    );
    const { user } = renderHistory();
    await screen.findByText("Delivered One");

    await user.click(screen.getByRole("button", { name: "Failed", pressed: false }));
    expect(await screen.findByText("Failed One")).toBeInTheDocument();
    expect(screen.queryByText("Delivered One")).not.toBeInTheDocument();
    expect(getTransferHistory).toHaveBeenCalledWith(expect.objectContaining({ group: "failed" }));
  });

  test("Load more appends the next page and disappears at the end", async () => {
    const all = Array.from({ length: 14 }, (_, i) =>
      tx({ id: `t${i}`, recipient_name: `Person ${i}` })
    );
    getTransferHistory.mockImplementation(fakeServer(all));
    const { user } = renderHistory();
    await screen.findByText("Person 0");

    expect(screen.queryByText("Person 12")).not.toBeInTheDocument();
    expect(screen.getByText(/showing 10 of 14/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /load more/i }));
    expect(await screen.findByText("Person 13")).toBeInTheDocument();
    expect(screen.getByText(/showing 14 of 14/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
    expect(getTransferHistory).toHaveBeenCalledWith(expect.objectContaining({ offset: 10 }));
  });

  test("clicking a row opens the detail via onOpenDetail", async () => {
    getTransferHistory.mockImplementation(fakeServer([tx({ id: "row-1" })]));
    const { user, onOpenDetail } = renderHistory();

    await user.click((await screen.findByText("Adaeze Okonkwo")).closest("button")!);
    expect(onOpenDetail).toHaveBeenCalledWith(expect.objectContaining({ id: "row-1" }));
  });
});
