import { describe, expect, test } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderKoboApp, sidebarNavButton } from "./test-utils";
import { NAV_ITEMS } from "@/lib/kobo/nav";

async function gotoOverview(user: Awaited<ReturnType<typeof renderKoboApp>>["user"]) {
  await user.click(sidebarNavButton("Overview"));
  await screen.findByRole("heading", { name: /welcome back/i });
}

const quickActions = () => within(screen.getByRole("group", { name: /quick actions/i }));

describe("Request tab", () => {
  test("renders its placeholder without breaking the summary panel", async () => {
    const { user } = await renderKoboApp();

    await user.click(screen.getByRole("tab", { name: "Request" }));
    expect(screen.getByText(/requesting money isn't available yet/i)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Send" }));
    expect(screen.getByText(/^1 EUR ≈/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm & continue/i })).toBeInTheDocument();
  });
});

describe("nav items", () => {
  test("every nav item now opens a real screen — none show the 'isn't built yet' stub", async () => {
    const { user } = await renderKoboApp();

    for (const label of NAV_ITEMS) {
      await user.click(sidebarNavButton(label));
      expect(screen.queryByText(/isn't built yet/i)).not.toBeInTheDocument();
    }
  });
});

describe("Recipients nav item", () => {
  test("renders the real Recipients screen, not the placeholder", async () => {
    const { user } = await renderKoboApp();

    await user.click(sidebarNavButton("Recipients"));
    expect(screen.getByRole("heading", { name: "Recipients" })).toBeInTheDocument();
    expect(screen.queryByText(/isn't built yet/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add recipient/i })).toBeInTheDocument();
  });
});

describe("Settings nav item", () => {
  test("renders the real Settings screen, not the placeholder", async () => {
    const { user } = await renderKoboApp();

    await user.click(sidebarNavButton("Settings"));
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.queryByText(/isn't built yet/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /change passcode/i })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Rate alerts" })).toBeInTheDocument();
  });
});

describe("Overview nav item", () => {
  test("renders the real Overview dashboard, not the placeholder", async () => {
    const { user } = await renderKoboApp();

    await user.click(sidebarNavButton("Overview"));
    expect(
      await screen.findByRole("heading", { name: /welcome back/i })
    ).toBeInTheDocument();
    expect(screen.queryByText(/isn't built yet/i)).not.toBeInTheDocument();
    // stat tiles + rate-watch card from the design export
    expect(screen.getByText("AVAILABLE")).toBeInTheDocument();
    expect(screen.getByText("SENT, LAST SIX MONTHS")).toBeInTheDocument();
  });

  test("the 'Send money now' rate-watch button takes you to the Send screen", async () => {
    const { user } = await renderKoboApp();

    await user.click(sidebarNavButton("Overview"));
    await screen.findByRole("heading", { name: /welcome back/i });
    await user.click(screen.getByRole("button", { name: /send money now/i }));
    expect(screen.getByRole("button", { name: /confirm & continue/i })).toBeInTheDocument();
  });
});

describe("Overview mobile quick actions", () => {
  test("offers exactly Add funds / Send / Activity — no invented entries", async () => {
    const { user } = await renderKoboApp();
    await gotoOverview(user);

    const labels = quickActions()
      .getAllByRole("button")
      .map((b) => b.textContent?.trim());
    expect(labels).toEqual(["Add funds", "Send", "Activity"]);
  });

  test("'Add funds' opens the shared Add Funds dialog", async () => {
    const { user } = await renderKoboApp();
    await gotoOverview(user);

    await user.click(quickActions().getByRole("button", { name: "Add funds" }));
    expect(
      await screen.findByRole("dialog", { name: /add funds/i })
    ).toBeInTheDocument();
  });

  test("'Send' goes to the Send screen", async () => {
    const { user } = await renderKoboApp();
    await gotoOverview(user);

    await user.click(quickActions().getByRole("button", { name: "Send" }));
    expect(
      await screen.findByRole("heading", { name: /send money home/i })
    ).toBeInTheDocument();
  });

  test("'Activity' goes to the Activity screen", async () => {
    const { user } = await renderKoboApp();
    await gotoOverview(user);

    await user.click(quickActions().getByRole("button", { name: "Activity" }));
    expect(
      await screen.findByRole("heading", { name: "Activity" })
    ).toBeInTheDocument();
  });
});

// "Recent transfers — View all" moved to transfer-history-ia.test.tsx: the
// preview (and its "View all" button) now lives on Overview, not the Send
// screen, so that suite exercises it from the right place.

describe("Activity nav item", () => {
  test("renders the real Activity screen with market + history sections", async () => {
    const { user } = await renderKoboApp();

    await user.click(sidebarNavButton("Activity"));
    expect(await screen.findByRole("heading", { name: "Activity" })).toBeInTheDocument();
    expect(screen.queryByText(/isn't built yet/i)).not.toBeInTheDocument();
    expect(screen.getByText("Market")).toBeInTheDocument();
    expect(screen.getByText("Transfer history")).toBeInTheDocument();
    // mock-mode transfer history is derived from the existing fixture
    expect((await screen.findAllByText("Adaeze Okonkwo")).length).toBeGreaterThan(0);
  });
});
