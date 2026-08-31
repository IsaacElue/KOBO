import { describe, expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KoboApp } from "@/components/kobo/kobo-app";
import { Toaster } from "@/components/ui/sonner";
import { renderKoboApp } from "./test-utils";

async function openAccountMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /account menu/i }));
  return screen.findByRole("menu");
}

describe("account dropdown menu", () => {
  test("opens with exactly three rows and no verification row", async () => {
    const { user } = await renderKoboApp();
    const menu = await openAccountMenu(user);

    expect(within(menu).getByRole("menuitem", { name: /account settings/i })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /help centre/i })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /sign out/i })).toBeInTheDocument();
    expect(within(menu).queryByText(/verification/i)).not.toBeInTheDocument();
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(3);
  });

  test("Account settings navigates to the Settings screen", async () => {
    const { user } = await renderKoboApp();
    const menu = await openAccountMenu(user);
    await user.click(within(menu).getByRole("menuitem", { name: /account settings/i }));

    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
  });

  test("Help centre navigates to the Help screen", async () => {
    const { user } = await renderKoboApp();
    const menu = await openAccountMenu(user);
    await user.click(within(menu).getByRole("menuitem", { name: /help centre/i }));

    expect(await screen.findByRole("heading", { name: /how can we help/i })).toBeInTheDocument();
  });

  test("mock mode: Sign out is present but does not start a logout", async () => {
    const { user } = await renderKoboApp();
    const menu = await openAccountMenu(user);
    await user.click(within(menu).getByRole("menuitem", { name: /sign out/i }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Log out?")).not.toBeInTheDocument();
  });

  test("real-auth mode: Sign out opens the shared confirm dialog, which calls onLogout", async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    render(
      <>
        <KoboApp onLogout={onLogout} undoGraceSeconds={0} />
        <Toaster />
      </>
    );
    await screen.findByRole("heading", { name: /send money home/i }, { timeout: 2000 });

    const menu = await openAccountMenu(user);
    await user.click(within(menu).getByRole("menuitem", { name: /sign out/i }));

    const confirm = await screen.findByText("Log out?");
    expect(confirm).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^log out$/i }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
