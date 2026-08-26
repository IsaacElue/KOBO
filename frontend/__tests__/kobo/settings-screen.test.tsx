import { describe, expect, test } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderKoboApp } from "./test-utils";

async function openSettings() {
  const { user } = await renderKoboApp();
  await user.click(screen.getByRole("button", { name: "Settings" }));
  await screen.findByRole("heading", { name: "Settings" });
  return { user };
}

describe("Settings — account details", () => {
  test("shows the real profile: email, country, member-since, linked address", async () => {
    await openSettings();

    // mock profile (lib/kobo/api.ts) — email + created_at come from GET /auth/me
    expect(screen.getAllByText("you@example.com").length).toBeGreaterThan(0);
    expect(screen.getByText("June 2026")).toBeInTheDocument();
    expect(
      screen.getByText("6Cx1cZ8mKpP1s6xM4mE9pN2vQ7wR3tYb5uH8jK4dLzAa")
    ).toBeInTheDocument();
  });

  test("no Log out section in mock mode (no real session to end)", async () => {
    await openSettings();
    expect(screen.queryByRole("button", { name: /^log out$/i })).not.toBeInTheDocument();
  });
});

describe("Settings — profile edit", () => {
  test("saving a new name updates the account details and toasts", async () => {
    const { user } = await openSettings();

    const nameInput = screen.getByLabelText("Name");
    await user.clear(nameInput);
    await user.type(nameInput, "Tomiwa Martins");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText(/profile updated/i)).toBeInTheDocument();
    const details = screen.getByText("Account details").closest("[data-slot=card]")!;
    expect(within(details as HTMLElement).getByText("Tomiwa Martins")).toBeInTheDocument();
  });

  test("Save changes is disabled until something actually changes", async () => {
    await openSettings();
    expect(screen.getByRole("button", { name: /save changes/i })).toBeDisabled();
  });
});

describe("Settings — password change", () => {
  test("rejects a mismatched confirmation", async () => {
    const { user } = await openSettings();

    await user.type(screen.getByLabelText("Current password"), "password123");
    await user.type(screen.getByLabelText("New password"), "newpass999");
    await user.type(screen.getByLabelText("Confirm new password"), "different999");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    expect(await screen.findByText(/passwords don't match/i)).toBeInTheDocument();
  });

  test("rejects a wrong current password against the backend", async () => {
    const { user } = await openSettings();

    await user.type(screen.getByLabelText("Current password"), "not-my-password");
    await user.type(screen.getByLabelText("New password"), "newpass999");
    await user.type(screen.getByLabelText("Confirm new password"), "newpass999");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    expect(await screen.findByText(/current password is incorrect/i)).toBeInTheDocument();
  });

  test("accepts a valid change", async () => {
    const { user } = await openSettings();

    await user.type(screen.getByLabelText("Current password"), "password123");
    await user.type(screen.getByLabelText("New password"), "brandnew123");
    await user.type(screen.getByLabelText("Confirm new password"), "brandnew123");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    expect(await screen.findByText(/password updated/i)).toBeInTheDocument();
  });
});
