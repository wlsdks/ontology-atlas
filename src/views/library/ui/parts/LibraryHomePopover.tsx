"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import type { useTranslations } from "next-intl";
import { X } from "lucide-react";

import { cn } from "@/shared/lib/cn";
import { Surface } from "@/shared/ui";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { transientSurface } from "@/shared/ui/transient-surface";

/**
 * **The Library home's one popup shape** — hung from the door that opened it.
 *
 * The home is the folder's graph (`docs/DECISIONS.md`, 2026-09-06 "The Library pane is
 * the graph; the shelf is a popup", restored 2026-09-12). Everything the three guide
 * cards used to say on every visit now lives behind a door on the strip above the canvas,
 * and this is what a door opens: `transientSurface("anchored")` on the shared `Surface`,
 * so the sweeping surface check measures it as the kind it is and owes it the three
 * properties that kind owes — beside its cause, closes on Escape, returns focus.
 *
 * ## Why a portal and `fixed`, not an absolute box in the pane
 *
 * The pane the strip sits in is `overflow-hidden` with its own scrollers inside it, so an
 * absolutely positioned panel is clipped by the first ancestor that scrolls — the defect
 * `shared/ui/select.tsx` records for its own listbox and solves the same way. The
 * coordinates are the door's own viewport rect, so the panel still stands beside its
 * cause; it is re-read on scroll and resize rather than frozen at open time.
 *
 * ## Not a modal, deliberately
 *
 * No scrim and no focus trap: `.claude/rules/design.md` requires a modal to prove its
 * modality, and the guide is a thing to read beside the picture rather than an errand
 * with a beginning and an end. The canvas keeps working behind it. What it does owe is
 * the anchored contract, and all three parts are here — Escape, an outside press, and
 * focus back on the door.
 */
export function LibraryHomePopover({
  open,
  onClose,
  anchorRef,
  fallbackAnchorRef,
  title,
  testId,
  align = "end",
  children,
  t,
}: {
  open: boolean;
  onClose: () => void;
  /** The door. Its rect places this panel, and focus returns to it on close. */
  anchorRef: RefObject<HTMLElement | null>;
  /**
   * The door to hang from when {@link anchorRef} is not drawn at this width.
   *
   * ⚠️ **Because below `lg` the strip's doors are `display:none`** and everything they
   * opened is reached through the one `…` door instead. Measured 2026-09-12
   * (design-responsive, council): a hidden anchor reports a 0×0 rect, so `place()`
   * computed top 8 / left 16 and the panel detached to the screen's corner with nothing
   * connecting it to the press — and `anchorRef.current?.focus()` on close no-opped,
   * leaving focus on `body`. The same arithmetic fires when a window crosses `lg` with a
   * panel already open.
   */
  fallbackAnchorRef?: RefObject<HTMLElement | null>;
  title: string;
  testId: string;
  /**
   * Which of the door's edges the panel lines up with. The doors sit at the right of the
   * strip, so `end` is the default; a clause in the middle of the strip wants `start`.
   */
  align?: "start" | "end";
  children: ReactNode;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  const panelRef = useRef<HTMLElement | null>(null);
  const [box, setBox] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  /**
   * The panel's place, from the door's rect.
   *
   * ⚠️ **Measured after it is drawn, not guessed before.** The panel's width depends on
   * its content up to the 560px cap, so a right-aligned panel placed from an assumed
   * width jumps on the first frame. The first pass uses the cap, the second corrects it
   * from the real `offsetWidth` — the same two-pass placement `SelectionAsk` needs.
   */
  /** Whichever of the two doors is actually drawn — see `fallbackAnchorRef`. */
  const anchorNow = useCallback((): HTMLElement | null => {
    const first = anchorRef.current;
    if (first && first.getBoundingClientRect().width > 0) return first;
    const second = fallbackAnchorRef?.current ?? null;
    if (second && second.getBoundingClientRect().width > 0) return second;
    return first ?? second;
  }, [anchorRef, fallbackAnchorRef]);

  const place = useCallback(() => {
    const anchor = anchorNow();
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    /* A door drawn at no width cannot place anything; leaving `box` alone keeps the last
       good placement instead of throwing the panel into the corner. */
    if (rect.width === 0 && rect.height === 0) return;
    const width = panelRef.current?.offsetWidth ?? Math.min(560, window.innerWidth - 32);
    const top = rect.bottom + 8;
    const raw = align === "end" ? rect.right - width : rect.left;
    const next = {
      top,
      left: Math.max(16, Math.min(raw, window.innerWidth - 16 - width)),
      /* Whatever is left under the door, minus the gutter: the panel scrolls inside. */
      maxHeight: Math.max(160, window.innerHeight - top - 16),
    };
    /* Equality first, because this runs after **every** render (see below): writing an
       identical box would be a render loop, not a placement. */
    setBox((current) =>
      current && current.top === next.top && current.left === next.left && current.maxHeight === next.maxHeight
        ? current
        : next,
    );
  }, [align, anchorNow]);

  /*
   * ⚠️ **Placed after every render, not once on open** (measured 2026-09-12).
   *
   * The guide raises itself on the home's first paint, and the strip it hangs from is
   * still growing at that moment: the canvas caption goes from `0 pages` to the folder's
   * real counts as the pages are read, which pushes the doors ~68px to the right. Placed
   * once, the panel stayed where the door *had been* and stood unhooked over the canvas.
   * A rAF chase would have worked and would also have been an idle loop; React already
   * re-renders on the state that moves the door, so this is the same correction for free.
   * `place` writes nothing when the numbers match, so a render that does not move the
   * door costs one `getBoundingClientRect`.
   */
  useLayoutEffect(() => {
    if (open) place();
  });

  useEffect(() => {
    if (!open) return;
    // A second pass once the content has width, then on anything that moves the door.
    const frame = window.requestAnimationFrame(place);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  /** The anchored contract: Escape closes, an outside press closes, focus returns. */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // The pane answers Escape by closing what is open; with a popup up, one press is
      // this popup's and the reader keeps its document.
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (anchorNow()?.contains(target)) return;
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onDown);
    };
  }, [anchorNow, onClose, open]);

  /*
   * Focus moves into the panel on open. Not a trap — the canvas behind stays live — but
   * the panel is what a person just asked for, and a popup nobody's keyboard can reach is
   * an anchored surface in name only. On close the door takes it back (below).
   */
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const first = panel.querySelector<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    (first ?? panel).focus({ preventScroll: true });
  }, [open]);

  /*
   * ⚠️ **Starts `true`, so a closed popover never takes focus on mount.**
   *
   * Four of these are mounted on the home at once, and with the flag starting `false`
   * every one of them ran its "give the door the keyboard back" branch on its first
   * commit — so arriving at the Library threw focus onto a door nobody had pressed, four
   * times over. Focus comes back only after this surface has actually been open.
   */
  const returned = useRef(true);
  useEffect(() => {
    if (open) {
      returned.current = false;
      return;
    }
    if (returned.current) return;
    returned.current = true;
    anchorNow()?.focus({ preventScroll: true });
  }, [anchorNow, open]);

  if (typeof document === "undefined" || box === null) return null;

  return createPortal(
    /*
     * ⚠️ **The wrapper carries the size, and that is what keeps the stepper's fold alive.**
     *
     * `library-spine-scope` is `container-type: size`, which needs a box definite in
     * *both* axes — so the 560px cap and the room-under-the-door height live here rather
     * than on the panel, and the panel is `w-full max-h-full` inside it. Put the scope on
     * the panel itself and size containment measures its own auto height as zero.
     *
     * The fold it enables (`app/globals.css`, `--library-spine-collapse-height`) was
     * written for the landing pane the three steps used to be drawn in. They are in this
     * popup now, and the quantity the fold wants is the same one: how much room the
     * surface has. `pointer-events-none`, because the wrapper is a measuring box that
     * reaches past the panel's own bottom edge and must not swallow a press on the canvas.
     */
    <div
      className="library-spine-scope pointer-events-none fixed z-40 w-[min(560px,calc(100vw-2rem))]"
      style={{ top: box.top, left: box.left, height: box.maxHeight }}
    >
      <Surface
        open={open}
        as="aside"
        ref={panelRef}
        motion="chrome"
        origin={align === "end" ? "top right" : "top left"}
        tabIndex={-1}
        {...transientSurface("anchored")}
        aria-label={title}
        data-testid={testId}
        className={cn(
          "pointer-events-auto flex max-h-full w-full flex-col overflow-hidden rounded-panel",
          "border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)]",
          "shadow-[var(--shadow-elevation-2)]",
        )}
      >
        <div className="flex flex-none items-center gap-2 border-b border-[color:var(--color-border-soft)] px-4 py-2.5">
          <h2 className="min-w-0 flex-1 truncate text-body font-[var(--font-weight-signature)] leading-title text-[color:var(--color-text-primary)]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            data-testid={`${testId}-close`}
            aria-label={t("stage.close")}
            className={controlClass({ shape: "icon", tone: "muted", hoverInk: "strong" })}
          >
            <X size={ICON_SIZE.sm} aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </Surface>
    </div>,
    document.body,
  );
}
