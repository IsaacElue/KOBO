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

describe("still-stubbed nav items", () => {
  test.each(
    NAV_ITEMS.filter(
      (n) => n !== "Send money" && n !== "Recipients" && n !== "Settings" && n !== "Overview"
    )
  )(
    "%s renders the 'isn't built yet' empty state with a working button back to Send",
    async (label) => {
      const { user } = await renderKoboApp();

      await user.click(screen.getByRole("button", { name: label }));
      expect(screen.getByText(new RegExp(`${label} isn't built yet`, "i"))).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /confirm & continue/i })).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /back to send money/i }));
      expect(screen.getByRole("button", { name: /confirm & continue/i })).toBeInTheDocument();
    }
  );
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
  test("renders the real Overview screen, not the placeholder", async () => {
    const { user } = await renderKoboApp();

    await user.click(screen.getByRole("button", { name: "Overview" }));
    expect(
      await screen.findByRole("heading", { name: /money that moves like a message/i })
    ).toBeInTheDocument();
    expect(screen.queryByText(/isn't built yet/i)).not.toBeInTheDocument();
  });

  test("the hero 'Send money' button takes you to the Send screen", async () => {
    const { user } = await renderKoboApp();

    await user.click(screen.getByRole("button", { name: "Overview" }));
    const hero = await screen.findByRole("heading", { name: /money that moves like a message/i });
    // the sidebar nav 'Send money' + the hero CTA both match — the hero one is the
    // last in DOM order and lives in the same <header> as the heading
    const heroCta = within(hero.closest("header")!).getByRole("button", { name: /send money/i });
    await user.click(heroCta);
    expect(screen.getByRole("button", { name: /confirm & continue/i })).toBeInTheDocument();
  });
});
