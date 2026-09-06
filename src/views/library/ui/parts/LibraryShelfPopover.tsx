"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";

import { cn } from "@/shared/lib/cn";
import { Surface } from "@/shared/ui";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { transientSurface } from "@/shared/ui/transient-surface";

/**
 * **The guided shelf, raised over the graph instead of standing beside it.**
 *
 * The owner opened the installed app on 2026-09-06 with two sources and two pages a local
 * `qwen3:8b` had written, and read the screen as two half-screens: *"shouldn't the
 * Library tab's default be the graph on top? why is the area split above and below? the
 * area underneath should come up as a popup."* The reading is the diagnosis. The shelf
 * answers **"what do I do next"**, which is a question a person asks once and then stops
 * asking; the graph answers **"what is in this folder"**, which is what the tab is for.
 * Giving a spent question a permanent half of the pane is what made the screen read as
 * split, and the fix is not smaller cards — it is that one of the two is transient.
 *
 * ## Why a `Surface`, and specifically not a modal
 *
 * `.claude/rules/design.md` makes a modal prove its modality, and this one cannot: it
 * exists to be read **against** the picture behind it ("1 waiting" means the dot with no
 * line), and nothing here is destructive or unanswerable. So: no scrim, no focus trap, no
 * `aria-modal`. It is `transientSurface('anchored')` — beside what opened it, may take
 * focus, closes on Escape and returns that focus — which is the contract the sweeping
 * surface check measures rather than guesses.
 *
 * ## Why it is anchored to the row and not to the chip's own box
 *
 * The chip lives in the graph's header, inside a pane that clips its own overflow, and
 * below `lg` that pane is **half a phone**. A popover parented there would be cut to
 * 373px at 390×844 — measured — so it hangs from the row that holds both panes instead,
 * under the header at the right edge, and can use the column's whole height. Its
 * transform origin still points at the chip, so it is born where the press happened.
 */
export function LibraryShelfPopover({
  open,
  onClose,
  /** The control that opened it. Focus goes back here, and its box is not "outside". */
  anchorRef,
  title,
  closeLabel,
  children,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLButtonElement | null>;
  title: string;
  closeLabel: string;
  children: ReactNode;
}) {
  const boxRef = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  /**
   * Whether this surface is the one that took focus.
   *
   * Focus is only given **back** when it is still inside — closing after a person has
   * already clicked something else must not yank the caret out from under them.
   */
  const tookFocus = useRef(false);

  /*
   * ⚠️ **While closed it listens to nothing.** This component is rendered beside the pane
   * whether or not it is open, and a document-level Escape handler that runs the whole
   * time would eat the key for every other surface on the screen. Measured elsewhere in
   * this repository on 2026-08-19: an always-on listener of exactly this shape took
   * Escape away from node detail and turned five specs red at once.
   */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.stopPropagation();
      onClose();
    };
    const onDown = (event: PointerEvent) => {
      const box = boxRef.current;
      const anchor = anchorRef.current;
      if (!(event.target instanceof Node)) return;
      if (box?.contains(event.target)) return;
      // The chip is the toggle, so a press on it is its own business: treating it as
      // "outside" closes here and reopens there, and the surface flickers.
      if (anchor?.contains(event.target)) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    // Capture, so a canvas that swallows `pointerdown` cannot leave this open.
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [anchorRef, onClose, open]);

  // Focus lands on the title, which is what a screen reader should hear first.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      headingRef.current?.focus({ preventScroll: true });
      tookFocus.current = true;
    }, 0);
    return () => window.clearTimeout(id);
  }, [open]);

  return (
    <Surface
      open={open}
      as="aside"
      ref={boxRef}
      motion="chrome"
      /* The chip sits at the top right of the pane, so that is where this is born. */
      origin="top right"
      {...transientSurface("anchored")}
      data-testid="library-shelf-popover"
      aria-label={title}
      onExited={() => {
        if (!tookFocus.current) return;
        tookFocus.current = false;
        anchorRef.current?.focus({ preventScroll: true });
      }}
      className={cn(
        "absolute right-3 top-12 z-30 flex w-[min(560px,calc(100%-1.5rem))] flex-col overflow-hidden",
        // The row's height minus the header it hangs from, so it can be taller than the
        // graph half it is drawn over — the whole reason it is parented here.
        "max-h-[calc(100%-4rem)]",
        // Below `lg` the bottom tab bar stands over this row, and a panel whose last card
        // ends behind it is a card nobody can press.
        "max-lg:max-h-[calc(100%-4rem-var(--topology-mobile-bottom-tab-reserve))]",
        "rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] shadow-[var(--shadow-elevation-2)]",
      )}
    >
      <div className="flex flex-none items-center gap-2 border-b border-[color:var(--color-border-soft)] px-4 py-2.5">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="min-w-0 flex-1 text-body font-[var(--font-weight-signature)] leading-title text-[color:var(--color-text-primary)] outline-none"
        >
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          data-testid="library-shelf-close"
          className={controlClass({ shape: "icon", tone: "muted", hoverSurface: "lift" })}
        >
          <X size={ICON_SIZE.sm} aria-hidden />
        </button>
      </div>
      {/* The cards scroll inside the panel, never the pane behind it. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">{children}</div>
    </Surface>
  );
}
