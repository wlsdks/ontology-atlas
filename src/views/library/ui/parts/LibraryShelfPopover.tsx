"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
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
 * ⚠️ **Then it was still too big** (owner, 2026-09-06, second reading). Shipped at 560px
 * it took the right 48% of a 1168px pane and its lower half lay across the graph's own
 * legend: *"the sizes inside the right panel are no good … and it overlaps this text"*.
 * The width is now the width of three rows of guidance — **360px**, measured x 1112–1472
 * at 1512 — and the height is the content's under the same cap, which puts the panel's
 * foot at y 517 with the legend at 954. Nothing about that is a taste: both numbers are
 * read back with `elementsFromPoint` in `tests/e2e/library.spec.ts`.
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
 * and can use the column's whole height. Its transform origin still points at the chip,
 * so it is born where the press happened.
 *
 * Its inset is **measured from the chip** and published as `--library-shelf-top` and
 * `--library-shelf-right` on that row, rather than written as a class. A class is right
 * only while the header is one line: at 390×844 the caption, the status strip and the chip
 * wrap to two, the chip's foot drops from 40px to 64, and a panel pinned at `top-12`
 * covered the verdict it was opened from (measured with `elementsFromPoint`). The
 * fallbacks in the class are that first, unmeasured frame.
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
  /**
   * **Where the chip actually is**, published as two variables on the containing block.
   *
   * ⚠️ It is written to the **row**, not to the panel, and the reason is a measured
   * failure: an earlier repair set `style.top` on the panel from a layout effect and the
   * panel is not in the document yet when that effect runs (the surface mounts with its
   * own presence pass), so the write landed on `null` and the class frame stood. At
   * 390×844 that frame is wrong — the caption, the status strip and the chip wrap to two
   * lines, the chip's foot drops from 40px to 64, and a panel pinned at 48 covered the
   * verdict it was opened from. The row is always mounted, and the variables inherit down
   * to whatever the surface mounts, so the value cannot miss its target.
   *
   * A layout effect that updates the DOM is what effects are for; holding the rect in
   * state would re-render for a number only the style reads, which is the cascade
   * `react-hooks/set-state-in-effect` exists to stop.
   */
  useLayoutEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    // The chip's nearest positioned ancestor is this popover's containing block too:
    // both hang from the same row, which `LibraryPage` marks `relative`.
    const row = anchor?.offsetParent as HTMLElement | null;
    if (!anchor || !row) return;
    const place = () => {
      const chip = anchor.getBoundingClientRect();
      const frame = row.getBoundingClientRect();
      row.style.setProperty("--library-shelf-top", `${Math.round(chip.bottom - frame.top + 8)}px`);
      row.style.setProperty(
        "--library-shelf-right",
        `${Math.round(Math.max(frame.right - chip.right, 12))}px`,
      );
    };
    place();
    /*
     * ⚠️ **A window resize is not the only thing that moves this chip** (design-interaction,
     * 2026-09-06). The two presses this panel stays open for — Add files and Compile —
     * rewrite the caption and the status strip that share the chip's `flex-wrap` row, and
     * at 390 that row wraps: the chip's foot moves between 40px and 64px with the window
     * untouched, and a panel holding the inset it measured before the press covers the
     * verdict it was opened from. That is the defect this file's header records, re-entered
     * through a different door. The observer watches the two boxes the inset is derived
     * from, so any reflow of either re-places it.
     */
    const observer = new ResizeObserver(place);
    observer.observe(anchor);
    observer.observe(row);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [anchorRef, open]);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  /**
   * Whether this surface is the one that took focus.
   *
   * ⚠️ **A record that focus was *ever* taken is not the test** (design-interaction,
   * 2026-09-06). The rule this flag was written for is "give focus back only when it is
   * still inside", and the flag cannot say that: press a control in the index while the
   * panel is open and the outside-press closes it, the click focuses that control, and one
   * exit window later the surface drags focus to the chip — out from under the hand that
   * just used something else. So the flag records only that this surface is the one that
   * may hand focus back, and `onExited` asks the document where focus actually is.
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
      id="library-shelf-popover"
      data-testid="library-shelf-popover"
      aria-label={title}
      onExited={() => {
        if (!tookFocus.current) return;
        tookFocus.current = false;
        /*
         * Only when the close left focus with nobody. `document.body` is where the browser
         * puts it when the focused element leaves the document, which is exactly what
         * closing this panel does and exactly what a keyboard person cannot recover from.
         * Anything else means somebody is already somewhere on purpose.
         */
        if (document.activeElement !== null && document.activeElement !== document.body) return;
        anchorRef.current?.focus({ preventScroll: true });
      }}
      className={cn(
        /*
         * **Under the chip, not merely at the right of the row.** The inset matches the
         * graph section's own horizontal padding (`px-5 sm:px-6 md:px-10`), so the panel's
         * right edge lands on the chip's — measured 1472px at 1512 wide, where the old
         * `right-3` put it 28px further out and the surface read as unattached.
         */
        "absolute z-30 flex w-[min(360px,calc(100%-2.5rem))] flex-col overflow-hidden",
        "top-[var(--library-shelf-top,3rem)] right-[var(--library-shelf-right,1.25rem)]",
        /*
         * A **cap**, and the height is the content's. Three rows come to roughly 320px, so
         * the panel ends well above the graph's legend at the foot of the pane — which is
         * the whole of "nothing overlaps the caption": it is measured, not asserted.
         */
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
          /* `lg`, not the default `md`: the icon step is 28 at `md`, and every other icon
             control this screen draws — the reading pane's outline and back-to-top — is
             32. One size step per role (`.claude/rules/design.md`). */
          className={controlClass({
            shape: "icon",
            size: "lg",
            tone: "muted",
            hoverSurface: "lift",
          })}
        >
          <X size={ICON_SIZE.sm} aria-hidden />
        </button>
      </div>
      {/* The cards scroll inside the panel, never the pane behind it. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">{children}</div>
    </Surface>
  );
}
