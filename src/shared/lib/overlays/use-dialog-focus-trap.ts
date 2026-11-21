"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Open Tab-trapping surfaces, oldest first. Only the last one answers Tab, or two traps fight over one press. */
const openTabTraps: symbol[] = [];

interface UseDialogFocusTrapOptions {
  open: boolean;
  onEscape?: () => void;
  initialFocus?: "container" | "first" | "none";
  restoreFocus?: boolean;
  /**
   * A non-modal surface passes `false`: trapping focus while the outside is live locks keyboard
   * users out (WAI-ARIA). The settings dock is one.
   */
  trapTab?: boolean;
}

/** Modal focus contract shared by product overlays: focus moves in on open, Tab/Shift+Tab stay inside, Escape is optionally consumed, and the exact opener gets focus back on close. */
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

    /*
     * A child that focused itself during commit (`autoFocus`) is already inside the container; it is
     * never the opener, or close would restore focus to an element that unmounts with the dialog.
     */
    const active = document.activeElement;
    previousFocusRef.current =
      active instanceof HTMLElement && !container.contains(active) ? active : null;

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

    const trapId = Symbol('tab-trap');
    if (trapTab) openTabTraps.push(trapId);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && onEscapeRef.current) {
        event.preventDefault();
        event.stopPropagation();
        onEscapeRef.current();
        return;
      }
      if (event.key !== "Tab" || !trapTab) return;
      if (openTabTraps[openTabTraps.length - 1] !== trapId) return;

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
      const trapAt = openTabTraps.indexOf(trapId);
      if (trapAt >= 0) openTabTraps.splice(trapAt, 1);
      if (!restoreFocus) return;
      const previous = previousFocusRef.current;
      previousFocusRef.current = null;
      if (previous?.isConnected) {
        previous.focus({ preventScroll: true });
        return;
      }
      /**
       * Never drop to `body` when the opening control is gone: the button that opens the shortcut sheet
       * unmounts while the sheet is open, so focus returns to the start of `<main>` rather than the top of
       * the document.
       */
      const main = document.querySelector<HTMLElement>("main#main");
      if (main) main.focus({ preventScroll: true });
    };
  }, [initialFocus, open, restoreFocus, trapTab]);

  return containerRef;
}
