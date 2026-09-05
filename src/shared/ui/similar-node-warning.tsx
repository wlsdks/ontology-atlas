"use client";

import { motion } from "framer-motion";
import { EXIT_TRANSITION, MOTION, useExitLockout } from "@/shared/motion";
import { cn } from "@/shared/lib/cn";
import { controlClass } from "./control-class";

export interface SimilarNodeWarningProps {
  /** An already-interpolated message. i18n belongs to the calling view; `shared/ui` renders
   *  the string as given. */
  message: string;
  openLabel: string;
  createAnywayLabel: string;
  onOpen: () => void;
  onCreateAnyway: () => void;
  className?: string;
}

/**
 * Non-blocking inline warning that a node being created closely duplicates an existing one.
 *
 * - **Non-blocking**: rendering this blocks nothing. Both buttons are explicit choices, not
 *   an approval checkpoint — under the human-sovereign principle the authority to create
 *   always stays with the user.
 * - **Never steals focus**: no autoFocus, and rendering alone does not move `activeElement`,
 *   so the title input the user is typing in keeps focus.
 * - No solid dot (inline text plus links only), so this counts as one inline use rather than
 *   a surface audited against the amber budget.
 * - Tokens: `--color-amber-signal-*` (warning). A different family from the
 *   `--color-amber-source-*` quarantine tokens — see `docs/DESIGN-SYSTEM.md`.
 * - Motion: opacity 0→1 plus translateY 4px→0. Under reduced-motion the app-wide
 *   `MotionProvider` (`reducedMotion="user"`) strips the transform and keeps the opacity
 *   transition, so this component needs no branch of its own.
 */
export function SimilarNodeWarning({
  message,
  openLabel,
  createAnywayLabel,
  onOpen,
  onCreateAnyway,
  className,
}: SimilarNodeWarningProps) {
  const { ref: exitLockoutRef, onAnimationStart } = useExitLockout<HTMLDivElement>();
  return (
    <motion.div
      ref={exitLockoutRef}
      role="status"
      onAnimationStart={onAnimationStart}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 0, transition: EXIT_TRANSITION }}
      // 0.15 was not on the ramp. An entrance is a surface moving into place, so it takes
      // `base` (2026-07-28).
      transition={MOTION.base}
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-chip border border-[color:var(--color-amber-signal-a28)] bg-[color:var(--color-amber-signal-a07)] px-2.5 py-2 text-label leading-label text-[color:var(--color-text-secondary)]",
        className,
      )}
    >
      <span className="min-w-0">{message}</span>
      <button
        type="button"
        onClick={onOpen}
        /*
         * A control inside a sentence (the warning row). The ramp floor of 24 (`min-h-6`)
         * raises the line from 16 to 24. WCAG 2.5.8 exempts inline text, but this row is an
         * action row rather than prose, so 24 is the right target — at 44 the warning would
         * become a banner.
         */
        className={controlClass({
          shape: "link",
          tone: "strong",
          className:
            "shrink-0 font-[var(--font-weight-signature)] underline decoration-[color:var(--color-border-strong)] underline-offset-2 hover:text-[color:var(--color-indigo-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset",
        })}
      >
        {openLabel}
      </button>
      <span aria-hidden className="text-[color:var(--color-text-quaternary)]">
        ·
      </span>
      <button
        type="button"
        onClick={onCreateAnyway}
        className={controlClass({
          shape: "link",
          className:
            "shrink-0 underline decoration-[color:var(--color-border-soft)] underline-offset-2 hover:text-[color:var(--color-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset",
        })}
      >
        {createAnywayLabel}
      </button>
    </motion.div>
  );
}
