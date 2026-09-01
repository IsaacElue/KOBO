import { beforeEach, describe, expect, test, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderKoboApp, sidebarNavButton } from "./test-utils";
import type { ActivityTransfer } from "@/lib/kobo/types";

const { getMyTransfers } = vi.hoisted(() => ({ getMyTransfers: vi.fn() }));
vi.mock("@/lib/kobo/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/kobo/api")>();
  return { ...actual, getMyTransfers };
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

beforeEach(() => {
  getMyTransfers.mockResolvedValue(makeTransfers(6));
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

    // wait for the list to populate, then count the transfer rows
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

  test("Overview preview and Activity list are the same data source", async () => {
    const { user } = await renderKoboApp();

    await gotoOverview(user);
    await previewCard().findByText("Person 0");
    const previewNames = previewCard()
      .getAllByRole("button")
      .map((b) => b.textContent?.match(/Person \d+/)?.[0])
      .filter((n): n is string => !!n);

    await user.click(sidebarNavButton("Activity"));
    await screen.findByRole("heading", { name: "Activity" });
    const historyCard = within(
      screen.getByText("Transfer history").closest("section") as HTMLElement
    );
    await historyCard.findByText("Person 0");
    const activityNames = historyCard
      .getAllByRole("button")
      .map((b) => b.textContent?.match(/Person \d+/)?.[0])
      .filter((n): n is string => !!n);

    // Activity shows all 6; the preview is exactly its first 4.
    expect(activityNames).toHaveLength(6);
    expect(previewNames).toEqual(activityNames.slice(0, 4));
  });

  test("Activity history rows are focusable buttons that open the detail dialog", async () => {
    const { user } = await renderKoboApp();
    await user.click(sidebarNavButton("Activity"));
    await screen.findByRole("heading", { name: "Activity" });

    const row = (await screen.findByText("Person 0")).closest("button") as HTMLButtonElement;
    expect(row.tagName).toBe("BUTTON");
    row.focus();
    expect(row).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(
      await screen.findByRole("dialog", { name: /transfer details/i })
    ).toBeInTheDocument();
  });
});
