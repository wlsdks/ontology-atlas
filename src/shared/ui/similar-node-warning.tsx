"use client";

import { motion } from "framer-motion";
import { EXIT_TRANSITION, MOTION, useExitLockout } from "@/shared/motion";
import { cn } from "@/shared/lib/cn";
import { controlClass } from "./control-class";

export interface SimilarNodeWarningProps {
  /** Already interpolated: i18n belongs to the calling view. */
  message: string;
  openLabel: string;
  createAnywayLabel: string;
  onOpen: () => void;
  onCreateAnyway: () => void;
  className?: string;
}

/**
 * Non-blocking inline warning that a new node duplicates an existing one. Both links are
 * explicit choices and creating stays the person's call. It never takes focus, so the title
 * input keeps it. Amber-signal tokens, not the amber-source quarantine family
 * (docs/DESIGN-SYSTEM.md); `MotionProvider` strips the transform under reduced motion.
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
      // An entrance is a surface moving into place, so it takes `base`.
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
         * An action row inside a sentence: the ramp floor of 24 (`min-h-6`) meets WCAG 2.5.8
         * without turning the warning into a 44px banner.
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
