"use client";

import { forwardRef, type ReactNode } from "react";

import { cn } from "@/shared/lib/cn";

/**
 * The insights board's section title as a real heading, so a screen-reader user can skim the board by heading.
 * One component keeps the title classes in one place instead of copies on spans. Preflight resets heading size and
 * weight, so the classes decide the look. `shrink-0` is the role's default: in a flex row the figures and chips
 * beside a title shrink, never the title. It forwards a ref: when a list's last self-deleting row goes, focus lands
 * on the heading.
 */
export const InsightsSectionTitle = forwardRef<
  HTMLHeadingElement,
  {
    /** A card title is 2 and a sub-section inside a card is 3; the page title owns `<h1>`. */
    level: 2 | 3;
    className?: string;
    children: ReactNode;
  } & Omit<React.HTMLAttributes<HTMLHeadingElement>, "className" | "children">
>(function InsightsSectionTitle({ level, className, children, ...rest }, ref) {
  const Tag = level === 2 ? "h2" : "h3";
  return (
    <Tag ref={ref} className={cn("shrink-0", className)} {...rest}>
      {children}
    </Tag>
  );
});
