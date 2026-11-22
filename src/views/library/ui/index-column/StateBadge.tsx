"use client";

import type { ReactNode } from "react";

import { cn } from "@/shared/lib/cn";
import { badgeClass } from "@/shared/ui/badge-class";

/**
 * One state word; geometry comes from the badge primitive, colour is this route's own
 * (see `badge-class.ts`).
 */
export function StateBadge({
  tone,
  children,
  testId,
}: {
  /* No dashed `quiet` tone: it cannot be told from the solid edge at 1x. `checking` wears `neutral`. */
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
