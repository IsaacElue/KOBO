import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { KoboApp } from "@/components/kobo/kobo-app";

function secondsLeft() {
  const text = screen.getByText(/^Locks in \d+s$/).textContent!;
  return parseInt(text.match(/(\d+)s/)![1], 10);
}

describe("rate lock countdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("drains and re-randomises the rate at zero", async () => {
    render(<KoboApp />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });

    const start = secondsLeft();
    const rateBefore = screen.getByText(/^1 EUR ≈/).textContent;

    // Advance to just before wraparound: the countdown should keep draining.
    await act(async () => {
      await vi.advanceTimersByTimeAsync((start - 1) * 1000);
    });
    expect(secondsLeft()).toBe(1);

    // One more tick wraps it back to 30 and re-randomises the rate.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(secondsLeft()).toBe(30);
    const rateAfter = screen.getByText(/^1 EUR ≈/).textContent;
    // Extremely unlikely for the random rate to collide across a re-randomisation.
    expect(rateAfter).not.toBe(rateBefore);
  });

  test("is paused while an overlay is open", async () => {
    render(<KoboApp />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });

    const before = secondsLeft();

    // Confirm & Continue now does a real (mock) balance check before opening the
    // passcode dialog — await the click so that microtask resolves first.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /confirm & continue/i }));
    });
    const dialog = screen.getByRole("dialog", { name: /enter your passcode/i });
    expect(within(dialog).getByText(/enter your passcode/i)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });

    // The countdown never ticked while the dialog was open.
    fireEvent.click(within(dialog).getByRole("button", { name: /back to form/i }));
    expect(secondsLeft()).toBe(before);
  });
});
