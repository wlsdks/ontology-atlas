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

import { cn } from "@/shared/lib/cn";
import { CloseButton, Surface } from "@/shared/ui";
import { transientSurface } from "@/shared/ui/surfaces/transient-surface";

/**
 * A portal and `fixed`, because the pane is `overflow-hidden` and an absolute panel would be
 * clipped; coordinates are the door's viewport rect, re-read on scroll and resize. Not modal: no
 * scrim or focus trap, but Escape, outside press and focus back on the door.
 */
/** The free area a Library popup may occupy: the reader pane its door sits in. */
const BOUNDARY_SELECTOR = '[data-testid="library-reader"]';

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
   * The door to hang from when `anchorRef` is not drawn at this width: below `lg` the strip's doors
   * are `display:none`, and a hidden anchor has a 0x0 rect and cannot take focus back.
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
  const [box, setBox] = useState<{ top: number; left: number; maxHeight: number; width: number } | null>(null);

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
    /*
     * Clamped to the reader pane, not only the window: the index column is the reader's left neighbour,
     * so the pane gives both the left edge and the width; a narrow pane narrows the panel.
     */
    const pane = anchor.closest<HTMLElement>(BOUNDARY_SELECTOR)?.getBoundingClientRect();
    const floor = pane ? Math.max(16, pane.left + 16) : 16;
    const ceiling = pane ? Math.min(window.innerWidth, pane.right) - 16 : window.innerWidth - 16;
    const cap = Math.max(240, Math.min(560, ceiling - floor));
    const width = Math.min(panelRef.current?.offsetWidth ?? cap, cap);
    const top = rect.bottom + 8;
    const raw = align === "end" ? rect.right - width : rect.left;
    const next = {
      top,
      left: Math.max(floor, Math.min(raw, ceiling - width)),
      /* Whatever is left under the door, minus the gutter: the panel scrolls inside. */
      maxHeight: Math.max(160, window.innerHeight - top - 16),
      width: cap,
    };
    /* Equality first, because this runs after **every** render (see below): writing an
       identical box would be a render loop, not a placement. */
    setBox((current) =>
      current &&
      current.top === next.top &&
      current.left === next.left &&
      current.maxHeight === next.maxHeight &&
      current.width === next.width
        ? current
        : next,
    );
  }, [align, anchorNow]);

  /*
   * Placed after every render, not once on open: the strip the panel hangs from keeps growing as pages
   * are read. `place` writes nothing when the numbers match, so an unmoved door costs one
   * `getBoundingClientRect`.
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
   * Focus moves to the panel itself, not its first control: the first focusable child is the close
   * button, and focusing it would make Enter dismiss the panel. It waits for `box`, since until
   * placement the component renders `null`; `focusedRef` keeps it to one move per open.
   */
  const focusedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      focusedRef.current = false;
      return;
    }
    if (focusedRef.current || box === null) return;
    const panel = panelRef.current;
    if (!panel) return;
    focusedRef.current = true;
    panel.focus({ preventScroll: true });
  }, [box, open]);

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
    /*
     * ⚠️ **Only when the close left the keyboard nowhere.** Escape and the `✕` do: focus
     * is inside the panel, which `Surface` still holds through its exit window, or already
     * on `body`. A press *somewhere else* does not — the canvas is `tabIndex=0`, so
     * pressing it both closes this and focuses the picture, and pulling focus back to a
     * chip the person did not touch is the surface arguing with their own gesture. Asking
     * the document is what distinguishes the three, without a flag each close has to
     * remember to set.
     */
    const active = document.activeElement;
    if (active && active !== document.body && !panelRef.current?.contains(active)) return;
    anchorNow()?.focus({ preventScroll: true });
  }, [anchorNow, open]);

  if (typeof document === "undefined" || box === null) return null;

  return createPortal(
    /*
     * The wrapper carries the size: `library-spine-scope` is `container-type: size`, which needs a box
     * definite in both axes, so the cap and the height live here. `pointer-events-none` because it
     * reaches past the panel's bottom edge and must not swallow canvas presses.
     */
    <div
      className="library-spine-scope pointer-events-none fixed z-40"
      style={{ top: box.top, left: box.left, height: box.maxHeight, width: box.width }}
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
          <CloseButton onClick={onClose} data-testid={`${testId}-close`} label={t("stage.close")} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </Surface>
    </div>,
    document.body,
  );
}
