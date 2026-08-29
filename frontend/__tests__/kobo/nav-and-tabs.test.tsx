import { describe, expect, test } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderKoboApp } from "./test-utils";
import { NAV_ITEMS } from "@/lib/kobo/nav";

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
    const sidebar = screen.getByRole("navigation");

    for (const label of NAV_ITEMS) {
      await user.click(within(sidebar).getByRole("button", { name: label }));
      expect(screen.queryByText(/isn't built yet/i)).not.toBeInTheDocument();
    }
  });
});

describe("Recipients nav item", () => {
  test("renders the real Recipients screen, not the placeholder", async () => {
    const { user } = await renderKoboApp();

    await user.click(screen.getByRole("button", { name: "Recipients" }));
    expect(screen.getByRole("heading", { name: "Recipients" })).toBeInTheDocument();
    expect(screen.queryByText(/isn't built yet/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add recipient/i })).toBeInTheDocument();
  });
});

describe("Settings nav item", () => {
  test("renders the real Settings screen, not the placeholder", async () => {
    const { user } = await renderKoboApp();

    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.queryByText(/isn't built yet/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /update password/i })).toBeInTheDocument();
  });
});

describe("Overview nav item", () => {
  test("renders the real Overview dashboard, not the placeholder", async () => {
    const { user } = await renderKoboApp();

    await user.click(screen.getByRole("button", { name: "Overview" }));
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

    await user.click(screen.getByRole("button", { name: "Overview" }));
    await screen.findByRole("heading", { name: /welcome back/i });
    await user.click(screen.getByRole("button", { name: /send money now/i }));
    expect(screen.getByRole("button", { name: /confirm & continue/i })).toBeInTheDocument();
  });
});

describe("Activity nav item", () => {
  test("renders the real Activity screen with market + history sections", async () => {
    const { user } = await renderKoboApp();

    await user.click(screen.getByRole("button", { name: "Activity" }));
    expect(await screen.findByRole("heading", { name: "Activity" })).toBeInTheDocument();
    expect(screen.queryByText(/isn't built yet/i)).not.toBeInTheDocument();
    expect(screen.getByText("Market")).toBeInTheDocument();
    expect(screen.getByText("Transfer history")).toBeInTheDocument();
    // mock-mode transfer history is derived from the existing fixture
    expect(await screen.findByText("Adaeze Okonkwo")).toBeInTheDocument();
  });
});
