import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WaitlistPanel } from "@/components/waitlist/waitlist-panel";

const { joinWaitlist, getRememberedSignup, resetWaitlist, isValidEmail } = vi.hoisted(() => ({
  joinWaitlist: vi.fn(),
  getRememberedSignup: vi.fn(),
  resetWaitlist: vi.fn(),
  isValidEmail: vi.fn(),
}));
vi.mock("@/lib/waitlist/api", () => ({
  joinWaitlist,
  getRememberedSignup,
  resetWaitlist,
  isValidEmail,
}));

beforeEach(() => {
  vi.clearAllMocks();
  isValidEmail.mockImplementation((e: string) => /\S+@\S+\.\S+/.test(e));
  getRememberedSignup.mockReturnValue(null);
});

/** Render and wait past the one-microtask "loading" placeholder. */
async function renderForm() {
  const user = userEvent.setup();
  render(<WaitlistPanel />);
  await screen.findByLabelText(/email address/i);
  return user;
}

describe("WaitlistPanel", () => {
  test("submitting a valid email calls the API and shows the real signup_number", async () => {
    joinWaitlist.mockResolvedValue({ signup_number: 137 });
    const user = await renderForm();

    await user.type(screen.getByLabelText(/email address/i), "hi@example.com");
    await user.click(screen.getByRole("button", { name: /join the waitlist/i }));

    expect(joinWaitlist).toHaveBeenCalledWith("hi@example.com");
    expect(await screen.findByText("#137")).toBeInTheDocument();
    expect(screen.getByText(/you're on the list/i)).toBeInTheDocument();
  });

  test("a big number is rendered with a thousands separator", async () => {
    joinWaitlist.mockResolvedValue({ signup_number: 12345 });
    const user = await renderForm();
    await user.type(screen.getByLabelText(/email address/i), "hi@example.com");
    await user.click(screen.getByRole("button", { name: /join the waitlist/i }));
    expect(await screen.findByText("#12,345")).toBeInTheDocument();
  });

  test("an invalid email is rejected client-side without calling the API", async () => {
    const user = await renderForm();
    await user.type(screen.getByLabelText(/email address/i), "nope");
    await user.click(screen.getByRole("button", { name: /join the waitlist/i }));
    expect(joinWaitlist).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/email address/i);
  });

  test("an API error is surfaced and the form stays usable", async () => {
    joinWaitlist.mockRejectedValue(new Error("Too many attempts. Please wait a minute and try again."));
    const user = await renderForm();
    await user.type(screen.getByLabelText(/email address/i), "hi@example.com");
    await user.click(screen.getByRole("button", { name: /join the waitlist/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/too many attempts/i);
    expect(screen.getByRole("button", { name: /join the waitlist/i })).toBeEnabled();
  });

  test("a returning visitor skips straight to their number", async () => {
    getRememberedSignup.mockReturnValue({ email: "back@example.com", signup_number: 88 });
    render(<WaitlistPanel />);
    expect(await screen.findByText("#88")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /join the waitlist/i })).not.toBeInTheDocument();
  });

  test("'use a different email' resets back to the form", async () => {
    getRememberedSignup.mockReturnValue({ email: "back@example.com", signup_number: 88 });
    const user = userEvent.setup();
    render(<WaitlistPanel />);
    await user.click(await screen.findByRole("button", { name: /use a different email/i }));
    expect(resetWaitlist).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /join the waitlist/i })).toBeInTheDocument();
  });

  test("no referral / queue-jump / estimated language anywhere", async () => {
    joinWaitlist.mockResolvedValue({ signup_number: 5 });
    const user = userEvent.setup();
    const { container } = render(<WaitlistPanel />);
    await screen.findByLabelText(/email address/i);
    await user.type(screen.getByLabelText(/email address/i), "hi@example.com");
    await user.click(screen.getByRole("button", { name: /join the waitlist/i }));
    await screen.findByText("#5");

    const text = container.textContent ?? "";
    expect(text).not.toMatch(/referral/i);
    expect(text).not.toMatch(/queue jump/i);
    expect(text).not.toMatch(/move up the queue/i);
    expect(text).not.toMatch(/estimated/i);
    expect(text).not.toMatch(/early access unlocked/i);
  });
});
