"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useReducedMotion } from "framer-motion";
import { useBodyScrollLock } from "@/shared/lib/overlays/use-body-scroll-lock";
import { focusTrapTarget, isPressOutsideDrawer } from "../lib/drawer-interaction";

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * The drawer's modal behaviour while a subject is shown: locked page scroll, Escape and an outside
 * press close it, focus moves to the close button and returns on close, Tab stays inside, and a
 * new subject scrolls back to the top. Returns the ref to put on the drawer element.
 */
export function useDrawerDialog({
  subject,
  onClose,
  closeLabel,
}: {
  subject: unknown;
  onClose: () => void;
  closeLabel: string;
}): RefObject<HTMLElement | null> {
  const drawerRef = useRef<HTMLElement | null>(null);
  const reducedMotion = useReducedMotion();

  useBodyScrollLock(Boolean(subject));

  useEffect(() => {
    if (!subject) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [subject, onClose]);

  const previousFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!subject) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const drawer = drawerRef.current;
    if (!drawer) return;
    drawer.querySelector<HTMLButtonElement>(`button[aria-label="${closeLabel}"]`)?.focus();
    return () => {
      previousFocusRef.current?.focus?.();
    };
  }, [subject, closeLabel]);

  useEffect(() => {
    if (!subject) return;
    const drawer = drawerRef.current;
    if (!drawer) return;
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const target = focusTrapTarget(
        Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)),
        document.activeElement,
        event.shiftKey,
      );
      if (!target) return;
      event.preventDefault();
      target.focus();
    };
    window.addEventListener("keydown", trapFocus);
    return () => window.removeEventListener("keydown", trapFocus);
  }, [subject]);

  useEffect(() => {
    if (!subject) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (isPressOutsideDrawer(event.target as HTMLElement | null, drawerRef.current)) onClose();
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [subject, onClose]);

  useEffect(() => {
    if (!subject || !drawerRef.current) return;
    drawerRef.current.scrollTo({
      top: 0,
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [subject, reducedMotion]);

  return drawerRef;
}
