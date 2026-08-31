import { describe, expect, test } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderKoboApp, sidebarNavButton } from "./test-utils";

/** Open Settings and wait for the real profile to have loaded (member-since only renders then). */
async function openSettings() {
  const { user } = await renderKoboApp();
  await user.click(screen.getByRole("button", { name: "Settings" }));
  await screen.findByRole("heading", { name: "Settings" });
  await screen.findByText("June 2026");
  return { user };
}

function profileCard() {
  return screen
    .getByText("Identity verified · Tier 3 limits")
    .closest("[data-slot=card]") as HTMLElement;
}

async function openEditProfile(user: Awaited<ReturnType<typeof openSettings>>["user"]) {
  await user.click(screen.getByRole("button", { name: /edit profile/i }));
  return screen.findByRole("dialog", { name: /edit profile/i });
}

async function openChangePasscode(user: Awaited<ReturnType<typeof openSettings>>["user"]) {
  await user.click(screen.getByRole("button", { name: /change passcode/i }));
  return screen.findByRole("dialog", { name: /change passcode/i });
}

describe("Settings — profile card", () => {
  test("shows the real profile: email, member-since, linked address", async () => {
    await openSettings();

    // mock profile (lib/kobo/api.ts) — email + created_at come from GET /auth/me
    expect(screen.getAllByText("you@example.com").length).toBeGreaterThan(0);
    expect(screen.getByText("June 2026")).toBeInTheDocument();
    expect(
      screen.getByText("6Cx1cZ8mKpP1s6xM4mE9pN2vQ7wR3tYb5uH8jK4dLzAa")
    ).toBeInTheDocument();
  });

  test("no Log out row in mock mode (no real session to end)", async () => {
    await openSettings();
    expect(screen.queryByRole("button", { name: /^log out$/i })).not.toBeInTheDocument();
  });
});

describe("Settings — edit profile dialog", () => {
  test("saving a new name updates the profile card and toasts", async () => {
    const { user } = await openSettings();

    await openEditProfile(user);
    const nameInput = screen.getByLabelText("Name");
    await user.clear(nameInput);
    await user.type(nameInput, "Tomiwa Martins");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText(/profile updated/i)).toBeInTheDocument();
    expect(within(profileCard()).getByText("Tomiwa Martins")).toBeInTheDocument();
  });

  test("Save changes is disabled until something actually changes", async () => {
    const { user } = await openSettings();
    await openEditProfile(user);
    expect(screen.getByRole("button", { name: /save changes/i })).toBeDisabled();
  });
});

describe("Settings — change passcode dialog", () => {
  test("rejects a mismatched confirmation", async () => {
    const { user } = await openSettings();
    await openChangePasscode(user);

    await user.type(screen.getByLabelText("Current password"), "password123");
    await user.type(screen.getByLabelText("New password"), "newpass999");
    await user.type(screen.getByLabelText("Confirm new password"), "different999");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    expect(await screen.findByText(/passwords don't match/i)).toBeInTheDocument();
  });

  test("rejects a wrong current password against the backend", async () => {
    const { user } = await openSettings();
    await openChangePasscode(user);

    await user.type(screen.getByLabelText("Current password"), "not-my-password");
    await user.type(screen.getByLabelText("New password"), "newpass999");
    await user.type(screen.getByLabelText("Confirm new password"), "newpass999");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    expect(await screen.findByText(/current password is incorrect/i)).toBeInTheDocument();
  });

  test("accepts a valid change", async () => {
    const { user } = await openSettings();
    await openChangePasscode(user);

    await user.type(screen.getByLabelText("Current password"), "password123");
    await user.type(screen.getByLabelText("New password"), "brandnew123");
    await user.type(screen.getByLabelText("Confirm new password"), "brandnew123");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    expect(await screen.findByText(/password updated/i)).toBeInTheDocument();
  });
});

describe("Settings — preferences", () => {
  test("toggles flip when clicked", async () => {
    const { user } = await openSettings();
    const rateAlerts = screen.getByRole("switch", { name: "Rate alerts" });
    expect(rateAlerts).toHaveAttribute("aria-checked", "true");

    await user.click(rateAlerts);
    expect(rateAlerts).toHaveAttribute("aria-checked", "false");
  });

  test("default currency can be changed and drives the send screen", async () => {
    const { user } = await openSettings();

    await user.click(screen.getByRole("button", { name: "GBP", pressed: false }));
    expect(screen.getByRole("button", { name: "GBP" })).toHaveAttribute("aria-pressed", "true");

    await user.click(sidebarNavButton("Send money"));
    expect(await screen.findByRole("heading", { name: /send money home/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Send currency")).toHaveTextContent("GBP");
  });
});
