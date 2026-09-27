import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { Dialog } from "./dialog";

/**
 * Dialog — the modality contract test.
 *
 * This is the enforcement for the design-systems seat's ratification
 * (2026-08-15, `docs/DECISIONS.md`). The primitive exists because 26
 * `role="dialog"` sites were each assembling modality themselves — 5 different
 * scrim tokens, 8 widths, a focus trap actually present in 8 of 20 — and what is
 * asserted here is the whole of that contract: modality (trap, Escape, focus
 * return, scroll lock, `aria-modal`) and the canonical tokens (z, scrim, width
 * formula).
 *
 * Asserting on class strings is legitimate here because they are **token
 * references**, not prose a human wrote — a different layer from what
 * `.claude/rules/documentation.md` forbids.
 */

function Harness({ size, onCloseSpy }: { size?: "sm" | "md"; onCloseSpy?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" data-testid="opener" onClick={() => setOpen(true)}>
        open
      </button>
      <Dialog
        open={open}
        onClose={() => {
          onCloseSpy?.();
          setOpen(false);
        }}
        size={size}
        aria-label="시험 대화상자"
        testId="probe-dialog"
      >
        <button type="button" data-testid="inner-first">
          first
        </button>
        <button type="button" data-testid="inner-last">
          last
        </button>
      </Dialog>
    </div>
  );
}

function openDialog() {
  act(() => {
    fireEvent.click(screen.getByTestId("opener"));
  });
  return screen.getByRole("dialog");
}

describe("Dialog modality contract", () => {
  it("renders nothing while closed", () => {
    render(<Harness />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens in a body portal with role=dialog and aria-modal", () => {
    render(<Harness />);
    const dialog = openDialog();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("시험 대화상자");
    // Portalled — it lives under body, not in the harness tree.
    expect(dialog.closest("[data-testid='opener']")).toBeNull();
    expect(document.body.contains(dialog)).toBe(true);
  });

  it("declares itself a transient sheet and carries the overlay spring marker", () => {
    render(<Harness />);
    const dialog = openDialog();
    expect(dialog.getAttribute("data-transient-surface")).toBe("sheet");
    expect(dialog.getAttribute("data-overlay-spring")).toBe("true");
  });

  it("uses the z ladder, scrim, width formula and elevation shadow tokens", () => {
    render(<Harness />);
    const dialog = openDialog();
    const scrim = dialog.parentElement as HTMLElement;
    expect(scrim.className).toContain("z-[var(--z-dialog)]");
    expect(scrim.className).toContain("bg-[color:var(--overlay-scrim)]");
    expect(scrim.className).toContain("fixed inset-0");
    expect(dialog.className).toContain("w-[min(var(--dialog-w-sm),calc(100vw-2rem))]");
    expect(dialog.className).toContain("shadow-[var(--shadow-elevation-3)]");
    expect(dialog.className).toContain("rounded-panel");
    expect(dialog.className).toContain("bg-[color:var(--color-panel)]");
    expect(dialog.className).toContain("border-[color:var(--color-divider)]");
  });

  it("uses the md width token when size=md", () => {
    render(<Harness size="md" />);
    const dialog = openDialog();
    expect(dialog.className).toContain("w-[min(var(--dialog-w-md),calc(100vw-2rem))]");
  });

  it("fills the viewport inside the chrome inset when size=viewport", () => {
    render(<Harness size={"viewport" as never} />);
    const dialog = openDialog();
    expect(dialog.className).toContain("w-[calc(100vw-var(--chrome-inset)*2)]");
    expect(dialog.className).toContain("h-[calc(100vh-var(--chrome-inset)*2)]");
    expect(dialog.className).toContain("max-w-none");
  });

  it("focuses the first focusable on open and returns focus to the opener on close", async () => {
    render(<Harness />);
    const opener = screen.getByTestId("opener");
    opener.focus();
    openDialog();
    await waitFor(() => {
      expect(document.activeElement?.getAttribute("data-testid")).toBe("inner-first");
    });
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(opener);
    });
  });

  it("closes on Escape", () => {
    let closed = 0;
    render(<Harness onCloseSpy={() => (closed += 1)} />);
    openDialog();
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(closed).toBe(1);
  });

  it("closes on a scrim click but not on a click inside the panel", () => {
    let closed = 0;
    render(<Harness onCloseSpy={() => (closed += 1)} />);
    const dialog = openDialog();
    fireEvent.click(dialog);
    fireEvent.click(screen.getByTestId("inner-first"));
    expect(closed).toBe(0);
    fireEvent.click(dialog.parentElement as HTMLElement);
    expect(closed).toBe(1);
  });

  it("locks body scroll while open and releases it on close", async () => {
    render(<Harness />);
    openDialog();
    expect(document.body.style.overflow).toBe("hidden");
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    await waitFor(() => {
      expect(document.body.style.overflow).not.toBe("hidden");
    });
  });
});
