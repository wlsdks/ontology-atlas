"use client";

import { useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { cn } from "@/shared/lib/cn";
import { mergeRefs } from "@/shared/lib/merge-refs";
import { useBodyScrollLock } from "@/shared/lib/use-body-scroll-lock";
import { useDialogFocusTrap } from "@/shared/lib/use-dialog-focus-trap";
import {
  EXIT_TRANSITION,
  OVERLAY_SPRING,
  OVERLAY_SPRING_REDUCED,
  SCRIM_FADE,
  SCRIM_FADE_REDUCED,
  useExitLockout,
} from "@/shared/motion";
import { transientSurface } from "./transient-surface";

/**
 * Dialog — **the centred dialog that blocks what is behind it.** Modality comes
 * as standard.
 *
 * **Why** (ratified by the design-systems seat 2026-08-15 — `docs/DECISIONS.md`).
 * 26 `role="dialog"` sites across 23 files were each assembling modality
 * themselves. Measured drift: **5 different** scrim tokens, plus 2 `aria-modal`
 * surfaces with no scrim at all (modal without modality — forbidden by
 * `.claude/rules/design.md`); **8 hardcoded widths** (360–576); hardcoded z
 * (`z-50` ×12, `z-40` ×3); and a focus trap actually present in **8 of 20**
 * sites that declared `aria-modal`. This is the slot `Surface` deliberately left
 * empty ("if you need a modal, stack that contract separately") — the same
 * disease as the inline-panel hard-cut incident, a missing **asset to copy**
 * rather than missing discipline, so it gets the same prescription: a primitive.
 *
 * **The contract — all on by default, no opt-out.** Focus trap · owns Escape ·
 * returns focus to the opening control · body scroll lock · `aria-modal` ·
 * close on scrim click. **There is no `modal={false}`**: the WAI-ARIA APG
 * requires this set as one package for the modal-dialog pattern, and an opt-out
 * switch becomes a hole through the whole contract. Non-modal surfaces are not
 * consumers of this component but of `Surface` plus
 * `transientSurface("anchored")`.
 *
 * **Canonical tokens** (exactly as the seat ruled). Scrim `--overlay-scrim`
 * (0.85 — the container doubles as the scrim, so there is a single z layer) · z
 * `--z-dialog` · surface `--color-panel` (the scrim provides the brightness
 * separation) · border `--color-divider` (one token with internal dividers) ·
 * radius `rounded-panel` · shadow `--shadow-elevation-3` (the dialog step) ·
 * width `--dialog-w-sm/md`, two steps, because the 8 hardcoded widths clustered
 * into exactly two (360–448 → 420, 480–576 → 560).
 *
 * **Motion** follows the incumbent majority overlay grammar — `SCRIM_FADE` for
 * the scrim, `OVERLAY_SPRING` for the panel (no overshoot; opacity plus an 8px
 * rise). Unifying on `Surface`'s CSS-keyframe grammar needs the motion seat's
 * co-signature and is not decided here (seat condition ⓒ).
 *
 * **Gates:** `dialog.test.tsx` (the modality contract) and
 * `tests/contract/dialog-adoption-ratchet` (a `role="dialog"` outside this file
 * cannot exceed the recorded baseline — new files start at 0). Declaring
 * `data-transient-surface="sheet"` inherits the 2026-08-11 sweep automatically.
 */
export interface DialogProps {
  open: boolean;
  /** Escape, a scrim click and the consumer's close button all funnel through this one. */
  onClose: () => void;
  /** Two width steps — sm 420 (default), md 560. A new step means convening the design-systems seat first. */
  size?: "sm" | "md";
  /**
   * `alertdialog` for a surface that interrupts to confirm something **irreversible**, `dialog`
   * (the default) for everything else. The WAI-ARIA APG separates the two on exactly that
   * question, and assistive tech reads an alert dialog's body immediately instead of waiting to
   * be walked into it — which is the whole point when the body names what is about to be
   * destroyed.
   *
   * ⚠️ **It is a role, not a second contract.** Scrim, focus trap, Escape, focus restoration and
   * scroll lock are unchanged and still not optional; this switches one attribute so a consumer
   * does not hand-build a modal to get it (2026-09-05, design council).
   */
  role?: "dialog" | "alertdialog";
  /** Id of the title element inside the panel. Without one, pass `aria-label` — an unnamed modal is not allowed. */
  labelledBy?: string;
  "aria-label"?: string;
  /**
   * Where focus lands on open. Default `first` (the first focusable — the APG
   * recommendation). Use `container` when the first control is destructive (a
   * delete confirmation), and `none` when the consumer moves focus to a specific
   * control from its own effect. The trap and the focus return stay owned by
   * this component either way.
   */
  initialFocus?: "container" | "first" | "none";
  testId?: string;
  /** Extra classes for the panel — layout only (flex, padding). Do not override the token contract. */
  className?: string;
  children: ReactNode;
}

/** There is no `document` during the static-export build, so portal only after the client mounts. */
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
  const reducedMotion = useReducedMotion();
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
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 8, opacity: 0, transition: EXIT_TRANSITION }}
            transition={reducedMotion ? OVERLAY_SPRING_REDUCED : OVERLAY_SPRING}
            role={role}
            aria-modal="true"
            aria-labelledby={labelledBy}
            aria-label={ariaLabel}
            tabIndex={-1}
            data-testid={testId}
            data-overlay-spring="true"
            {...transientSurface("sheet")}
            // No ring on programmatically moved container focus
            // (the verdict `dialog-focus-ring.spec.ts` enforces).
            className={cn(
              "w-[min(var(--dialog-w-sm),calc(100vw-2rem))] rounded-panel border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] p-4 shadow-[var(--shadow-elevation-3)] focus:outline-none",
              size === "md" && "w-[min(var(--dialog-w-md),calc(100vw-2rem))]",
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
