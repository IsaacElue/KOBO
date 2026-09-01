import { beforeEach, describe, expect, test, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderKoboApp, sidebarNavButton } from "./test-utils";
import type { ActivityTransfer, TransferHistoryPage } from "@/lib/kobo/types";

const { getMyTransfers, getTransferHistory } = vi.hoisted(() => ({
  getMyTransfers: vi.fn(),
  getTransferHistory: vi.fn(),
}));
vi.mock("@/lib/kobo/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/kobo/api")>();
  return { ...actual, getMyTransfers, getTransferHistory };
});

function makeTransfers(n: number): ActivityTransfer[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `tr_${i}`,
    recipient_id: "rcp_chidi",
    recipient_name: `Person ${i}`,
    amount_eur: 100 + i,
    amount_usdc: null,
    status: "confirmed" as const,
    solana_tx_signature: null,
    failure_reason: null,
    created_at: new Date(Date.UTC(2026, 7, 20 - i)).toISOString(),
  }));
}

/** getTransferHistory backed by the same fixture — honours offset/limit only. */
function pageFrom(all: ActivityTransfer[]) {
  return async ({ offset = 0, limit = 10 } = {}): Promise<TransferHistoryPage> => {
    const slice = all.slice(offset, offset + limit);
    return {
      transfers: slice,
      total: all.length,
      limit,
      offset,
      has_more: offset + slice.length < all.length,
    };
  };
}

beforeEach(() => {
  const all = makeTransfers(6);
  getMyTransfers.mockResolvedValue(all);
  getTransferHistory.mockImplementation(pageFrom(all));
});

async function gotoOverview(user: Awaited<ReturnType<typeof renderKoboApp>>["user"]) {
  await user.click(sidebarNavButton("Overview"));
  await screen.findByRole("heading", { name: /welcome back/i });
}

function previewCard() {
  return within(
    screen.getByText("Recent transfers").closest("[data-slot='card']") as HTMLElement
  );
}

function historySection() {
  return within(screen.getByText("Transfer history").closest("section") as HTMLElement);
}

describe("transfer-history IA", () => {
  test("Send Money screen has no transfer-history section", async () => {
    await renderKoboApp(); // lands on Send

    expect(screen.getByRole("heading", { name: /send money home/i })).toBeInTheDocument();
    expect(screen.queryByText("Recent transfers")).not.toBeInTheDocument();
    expect(screen.queryByText(/transfer history/i)).not.toBeInTheDocument();
  });

  test("Overview shows a Recent transfers preview, capped at 4", async () => {
    const { user } = await renderKoboApp();
    await gotoOverview(user);

    await previewCard().findByText("Person 0");
    const transferRows = previewCard()
      .getAllByRole("button")
      .filter((b) => /Person \d/.test(b.textContent ?? ""));
    expect(transferRows).toHaveLength(4);
    expect(transferRows[0]).toHaveTextContent("Person 0");
    expect(previewCard().queryByText("Person 4")).not.toBeInTheDocument();
  });

  test("'View all' on the preview goes to the Activity screen", async () => {
    const { user } = await renderKoboApp();
    await gotoOverview(user);

    await user.click(previewCard().getByRole("button", { name: /view all/i }));
    expect(await screen.findByRole("heading", { name: "Activity" })).toBeInTheDocument();
  });

  test("Overview preview is the first 4 of the Activity history", async () => {
    const { user } = await renderKoboApp();

    await gotoOverview(user);
    await previewCard().findByText("Person 0");
    const previewNames = previewCard()
      .getAllByRole("button")
      .map((b) => b.textContent?.match(/Person \d+/)?.[0])
      .filter((n): n is string => !!n);

    await user.click(sidebarNavButton("Activity"));
    await screen.findByRole("heading", { name: "Activity" });
    await historySection().findByText("Person 0");
    const activityNames = historySection()
      .getAllByRole("button")
      .map((b) => b.textContent?.match(/Person \d+/)?.[0])
      .filter((n): n is string => !!n);

    expect(activityNames).toHaveLength(6);
    expect(previewNames).toEqual(activityNames.slice(0, 4));
  });

  test("Activity history rows are focusable buttons that open the detail dialog", async () => {
    const { user } = await renderKoboApp();
    await user.click(sidebarNavButton("Activity"));
    await screen.findByRole("heading", { name: "Activity" });

    const row = (await historySection().findByText("Person 0")).closest("button") as HTMLButtonElement;
    expect(row.tagName).toBe("BUTTON");
    row.focus();
    expect(row).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(
      await screen.findByRole("dialog", { name: /transfer details/i })
    ).toBeInTheDocument();
  });
});
