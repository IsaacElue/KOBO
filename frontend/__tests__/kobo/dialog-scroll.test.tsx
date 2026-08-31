import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * The shared dialog components must cap their height and scroll their overflow,
 * so a dialog taller than the viewport (landscape, folded devices, keyboard-open
 * auth forms) doesn't clip its title/footer off-screen with no way to reach
 * them. jsdom does no layout, so this guards the mechanics at the class level.
 */
describe("shared dialog viewport-height guard", () => {
  test("DialogContent caps height (dvh) and scrolls its overflow", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
        </DialogContent>
      </Dialog>
    );
    const content = screen.getByRole("dialog");
    expect(content).toHaveClass("max-h-[calc(100dvh-2rem)]", "overflow-y-auto");
  });

  test("AlertDialogContent caps height (dvh) and scrolls its overflow", () => {
    render(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogTitle>Title</AlertDialogTitle>
        </AlertDialogContent>
      </AlertDialog>
    );
    const content = screen.getByRole("alertdialog");
    expect(content).toHaveClass("max-h-[calc(100dvh-2rem)]", "overflow-y-auto");
  });

  test("a consumer's own max-h wins over the base one (no double cap)", () => {
    render(
      <Dialog open>
        <DialogContent className="max-h-[calc(100vh-4rem)]">
          <DialogTitle>Title</DialogTitle>
        </DialogContent>
      </Dialog>
    );
    const content = screen.getByRole("dialog");
    // tailwind-merge collapses the conflicting max-h utilities, keeping the
    // consumer's — the success-dialog case — and a single overflow-y-auto.
    expect(content).toHaveClass("max-h-[calc(100vh-4rem)]", "overflow-y-auto");
    expect(content).not.toHaveClass("max-h-[calc(100dvh-2rem)]");
    expect(content.className.match(/overflow-y-auto/g)).toHaveLength(1);
  });
});
