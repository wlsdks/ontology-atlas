"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface UseDialogFocusTrapOptions {
  open: boolean;
  onEscape?: () => void;
  initialFocus?: "container" | "first" | "none";
  restoreFocus?: boolean;
  /**
   * Whether Tab/Shift+Tab stay inside this surface. Default `true` (modal).
   *
   * **A non-modal surface must pass `false`** — trapping focus while the outside
   * is still live locks keyboard users out of what everyone else can reach.
   * WAI-ARIA states that a non-modal dialog does not trap focus. The settings
   * dock is this case: it exists to adjust values while watching the map, so
   * tabbing out to the map has to work.
   */
  trapTab?: boolean;
}

/**
 * Modal focus contract shared by product overlays:
 * - move focus into the dialog on open,
 * - keep Tab/Shift+Tab inside,
 * - optionally consume Escape,
 * - restore the exact opener on close.
 */
export function useDialogFocusTrap<T extends HTMLElement>({
  open,
  onEscape,
  initialFocus = "container",
  restoreFocus = true,
  trapTab = true,
}: UseDialogFocusTrapOptions): RefObject<T | null> {
  const containerRef = useRef<T | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onEscapeRef = useRef(onEscape);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!open) return undefined;
    const container = containerRef.current;
    if (!container) return undefined;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) =>
          !element.hasAttribute("disabled") &&
          element.getAttribute("aria-hidden") !== "true",
      );

    if (initialFocus === "container") {
      container.focus({ preventScroll: true });
    } else if (initialFocus === "first") {
      focusables()[0]?.focus({ preventScroll: true });
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && onEscapeRef.current) {
        event.preventDefault();
        event.stopPropagation();
        onEscapeRef.current();
        return;
      }
      if (event.key !== "Tab" || !trapTab) return;

      const items = focusables();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) {
        event.preventDefault();
        container.focus({ preventScroll: true });
        return;
      }

      const active = document.activeElement;
      if (!container.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
      } else if (event.shiftKey && (active === first || active === container)) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (!restoreFocus) return;
      const previous = previousFocusRef.current;
      previousFocusRef.current = null;
      if (previous?.isConnected) {
        previous.focus({ preventScroll: true });
        return;
      }
      /**
       * **Never drop to `body` just because the opening control is gone**
       * (measured on the keyboard, 2026-07-29).
       *
       * The button that opens the shortcut sheet **unmounts when the sheet
       * opens**: the sheet raises `topologyBlockingOverlayActive`, which turns
       * off that button's render condition. So on close there is nothing left to
       * restore to and focus landed on `body`, from where the next Tab restarts
       * at the top of the document (the skip link) — measured at 29 stops before
       * where the user had been.
       *
       * Opening the same sheet with `?` from an element that **survives** (the
       * auto-arrange tile) restored correctly, so this is not a defect in the
       * trap but an unhandled case: the place to return to disappeared.
       *
       * `<main>` is already focusable thanks to the skip-link fix. Returning to
       * **the start of the content** rather than the start of the page lets the
       * user resume near the trigger that vanished.
       */
      const main = document.querySelector<HTMLElement>("main#main");
      if (main) main.focus({ preventScroll: true });
    };
  }, [initialFocus, open, restoreFocus, trapTab]);

  return containerRef;
}
