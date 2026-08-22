"use client";

import type { ReactNode } from "react";

import { cn } from "@/shared/lib/cn";

/**
 * The insights board's **section title** — it turns a hierarchy that was only visible into document
 * structure.
 *
 * Measured while dogfooding, 2026-07-29: the whole screen had **one `<h1>`** and nothing else.
 * Section titles like "agent readiness", "repair queue", and "referenced in many places" were all
 * `<span>`s wearing `text-body-lg font-[var(--font-weight-signature)]`, so the screen showed a
 * hierarchy while **the document had none**.
 *
 * What that actually prevented: a screen-reader user cannot skim this board by heading. There is no
 * way to jump straight to "repair queue" other than passing through every item in order — and this
 * is a maintenance board built precisely **to be skimmed while picking the next thing to do**. Take
 * skimming away and the screen's job cannot be done.
 *
 * Why a component: the same class string was duplicated twelve times across five files. Changing
 * only the tags leaves those duplicates, and the next person writes a thirteenth `<span>`. Giving
 * the role a name makes the next person walk through this door.
 *
 * There is no visual change — Tailwind preflight resets a heading's font-size and weight to
 * `inherit`, and size and weight are decided by the classes stated here.
 *
 * **Why `shrink-0` is the default** (narrow-width measurement, 2026-07-29): at 834px "repair queue"
 * folded **in the middle of its name** into two lines. In the flex row holding the title, the
 * figure-chip group beside it took 273px without `min-w-0`, squeezing the title column to 30px. The
 * card right next to it ("agent readiness") was fine in the same situation — only that one's chip
 * group had `min-w-0`.
 *
 * **Two titles in the same role were under different rules.** Fixing it per call site means it
 * recurs on the third card. A title does not exist in order to fold, so the rule is attached to the
 * role — the side that should be squeezed is always the figures and chips beside it.
 */
export function InsightsSectionTitle({
  level,
  className,
  children,
  ...rest
}: {
  /** A card title is 2; a sub-section inside a card is 3. `<h1>` is already taken by the page title. */
  level: 2 | 3;
  className?: string;
  children: ReactNode;
} & Omit<React.HTMLAttributes<HTMLHeadingElement>, "className" | "children">) {
  const Tag = level === 2 ? "h2" : "h3";
  return (
    <Tag className={cn("shrink-0", className)} {...rest}>
      {children}
    </Tag>
  );
}
