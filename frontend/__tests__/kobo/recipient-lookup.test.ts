import { describe, expect, test, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderKoboApp, sidebarNavButton } from "./test-utils";
import { findRecipientByEmail } from "@/lib/kobo/api";

describe("recipient lookup", () => {
  test("Add recipient dialog on the Recipients screen offers email-first provisioning", async () => {
    const { user } = await renderKoboApp();

    // Recipients -> Add recipient (the screen's primary action).
    await user.click(sidebarNavButton("Recipients"));
    await screen.findByRole("heading", { name: "Recipients" });

    await user.click(screen.getByRole("button", { name: /^add recipient$/i }));

    // Email is the default mode: the description promises we handle the
    // wallet for the user, and the alternative is an explicit address toggle.
    const dialog = await screen.findByRole("dialog", { name: /add new recipient/i });
    expect(within(dialog).getByText(/We'll handle the wallet for you\./i)).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: /already have their wallet address/i })
    ).toBeInTheDocument();
  });

  test("findRecipientByEmail resolves null in mock mode without calling fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const result = await findRecipientByEmail("folake@example.com");
      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
