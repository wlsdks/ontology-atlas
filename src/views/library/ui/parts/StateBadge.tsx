"use client";

import type { ReactNode } from "react";

import { cn } from "@/shared/lib/cn";
import { badgeClass } from "@/shared/ui/badge-class";

/**
 * One state word. Geometry comes from the badge primitive; the colour is this route's own
 * verdict, which is the split `badge-class.ts` documents in its own header.
 *
 * **Why it is its own file** (design-infoviz, council 2026-09-11). It shipped inside
 * `LibrarySection`, where it drew the index's two grades — a quiet neutral word for
 * *nothing to act on* and the amber pill for *a row a person can fix*. The saved-question
 * rows on the landing needed the same two grades for the same reason: one bold mark was
 * drawing five `answerObservation` states, so *no change since source observation* was as
 * loud as *a cited original is missing*. A second spelling of the same badge is how two
 * lists come to disagree about what amber means, so both read this one.
 */
export function StateBadge({
  tone,
  children,
  testId,
}: {
  tone: "neutral" | "warning";
  children: ReactNode;
  testId?: string;
}) {
  return (
    <span
      data-testid={testId}
      className={badgeClass({
        shape: "micro",
        className: cn(
          "flex-none border",
          tone === "warning"
            ? "border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a12)] text-[color:var(--color-amber-source-a90)]"
            : "border-[color:var(--color-border-soft)] text-[color:var(--color-text-quaternary)]",
        ),
      })}
    >
      {children}
    </span>
  );
}
