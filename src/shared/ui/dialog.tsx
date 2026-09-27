"use client";

import { useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

import { cn } from "@/shared/lib/cn";
import { mergeRefs } from "@/shared/lib/merge-refs";
import { useBodyScrollLock } from "@/shared/lib/use-body-scroll-lock";
import { useDialogFocusTrap } from "@/shared/lib/use-dialog-focus-trap";
import { usePrefersReducedMotion } from "@/shared/lib/use-prefers-reduced-motion";
import {
  EXIT_TRANSITION,
  OVERLAY_RISE,
  OVERLAY_RISE_REDUCED,
  OVERLAY_SETTLED,
  OVERLAY_SPRING,
  OVERLAY_SPRING_REDUCED,
  SCRIM_FADE,
  SCRIM_FADE_REDUCED,
  useExitLockout,
} from '@/shared/motion';
import { transientSurface } from "./transient-surface";

/**
 * The centred modal dialog. Focus trap, Escape, focus return, scroll lock, `aria-modal` and
 * scrim-click close are one package with no opt-out (WAI-ARIA APG, `.claude/rules/design.md`);
 * non-modal surfaces use `Surface` with `transientSurface("anchored")`. Tokens as ratified
 * in `docs/DECISIONS.md`; `role="dialog"` elsewhere is held
 * by `tests/contract/dialog-adoption-ratchet`.
 */
export interface DialogProps {
  open: boolean;
  /** Escape, a scrim click and the consumer's close button all go through this. */
  onClose: () => void;
  /** Two fixed prompt widths, or a viewport work surface inside the chrome inset. */
  size?: "sm" | "md" | "viewport";
  /**
   * Use `alertdialog` for confirming something irreversible, so assistive tech reads the body
   * at once. Only the role changes; the modal contract stays.
   */
  role?: "dialog" | "alertdialog";
  /** Id of the title element; without one pass `aria-label`: an unnamed modal is not allowed. */
  labelledBy?: string;
  "aria-label"?: string;
  /**
   * Where focus lands on open. `container` when the first control is destructive, `none` when
   * the consumer focuses a control itself; the trap and return stay here.
   */
  initialFocus?: "container" | "first" | "none";
  testId?: string;
  /** Layout only; do not override the token contract. */
  className?: string;
  children: ReactNode;
}

/** No `document` exists during the static export build, so portal only after mount. */
function useIsMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function Dialog({
  open,
  onClose,
  size = "sm",
  role = "dialog",
  labelledBy,
  "aria-label": ariaLabel,
  initialFocus = "first",
  testId,
  className,
  children,
}: DialogProps) {
  const reducedMotion = usePrefersReducedMotion();
  const overlayStart = reducedMotion ? OVERLAY_RISE_REDUCED : OVERLAY_RISE;
  const containerRef = useDialogFocusTrap<HTMLDivElement>({
    open,
    onEscape: onClose,
    initialFocus,
  });
  const { ref: scrimLockoutRef, onAnimationStart: scrimLockoutOnAnimationStart } = useExitLockout<HTMLDivElement>();
  const { ref: containerLockoutRef, onAnimationStart: containerLockoutOnAnimationStart } = useExitLockout<HTMLDivElement>();
  useBodyScrollLock(open);
  const mounted = useIsMounted();

  if (!mounted) return null;

  const handleScrimClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          ref={scrimLockoutRef}
          onAnimationStart={scrimLockoutOnAnimationStart}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: EXIT_TRANSITION }}
          transition={reducedMotion ? SCRIM_FADE_REDUCED : SCRIM_FADE}
          data-overlay-spring="true"
          className="fixed inset-0 z-[var(--z-dialog)] flex items-center justify-center bg-[color:var(--overlay-scrim)] px-4"
          onClick={handleScrimClick}
        >
          <motion.div
            ref={mergeRefs(containerRef, containerLockoutRef)}
            onAnimationStart={containerLockoutOnAnimationStart}
            initial={overlayStart}
            animate={OVERLAY_SETTLED}
            exit={{ ...overlayStart, transition: EXIT_TRANSITION }}
            transition={reducedMotion ? OVERLAY_SPRING_REDUCED : OVERLAY_SPRING}
            role={role}
            aria-modal="true"
            aria-labelledby={labelledBy}
            aria-label={ariaLabel}
            tabIndex={-1}
            data-testid={testId}
            data-overlay-spring="true"
            {...transientSurface("sheet")}
            // No ring on programmatic container focus (`dialog-focus-ring.spec.ts`).
            className={cn(
              "rounded-panel border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] p-4 shadow-[var(--shadow-elevation-3)] focus:outline-none",
              size !== "viewport" && "w-[min(var(--dialog-w-sm),calc(100vw-2rem))]",
              size === "md" && "w-[min(var(--dialog-w-md),calc(100vw-2rem))]",
              size === "viewport" && "h-[calc(100vh-var(--chrome-inset)*2)] w-[calc(100vw-var(--chrome-inset)*2)] max-w-none",
              className,
            )}
          >
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
