"use client";

import {
  type ComponentPropsWithoutRef,
  type ReactNode,
  forwardRef,
  useState,
} from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/shared/lib/cn";

/**
 * Radix tooltip used instead of the HTML `title`: it works with touch, keeps styling consistent
 * and shows on keyboard focus. Several tooltips in one tree share one `TooltipProvider`.
 */
export const TooltipProvider = TooltipPrimitive.Provider;

const TooltipContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> & { panelClassName?: string }
>(({ className, panelClassName, sideOffset = 6, collisionPadding = 8, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    collisionPadding={collisionPadding}
    className={cn(
      className ??
        "atlas-tooltip data-[state=closed]:pointer-events-none z-[var(--z-tooltip)] rounded-chip border border-[color:var(--color-indigo-a32)] bg-[color:var(--color-panel)] px-2 py-1 text-label text-[color:var(--color-text-primary)] shadow-[var(--shadow-elevation-1)]",
      panelClassName,
    )}
    {...props}
  />
));
TooltipContent.displayName = "TooltipContent";

export interface TooltipProps {
  /** A ReactNode works, but keep it light: it is also the accessible description. */
  content: ReactNode;
  children: ReactNode;
  /** Defaults to `top`. */
  side?: TooltipPrimitive.TooltipContentProps["side"];
  /**
   * Aligning to `start` suits a panel under a small glyph: centred, it straddles the trigger
   * and the collision logic slides it somewhere arbitrary.
   */
  align?: TooltipPrimitive.TooltipContentProps["align"];
  /** Set false when the tree already has a `TooltipProvider`. */
  withProvider?: boolean;
  /** Defaults to 300. */
  delayMs?: number;
  /**
   * Appended to the panel's classes, unlike `className`, which replaces its appearance.
   * For `pointer-events-none` on a panel over a control the hand reaches next: Radix keeps the
   * content mounted through its exit, so it would still catch the pointer.
   */
  panelClassName?: string;
}

/** Includes its own provider unless `withProvider={false}`. */
export function Tooltip({
  content,
  children,
  side = "top",
  align,
  withProvider = true,
  delayMs = 300,
  panelClassName,
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const inner = (
    <TooltipPrimitive.Root delayDuration={delayMs} open={open} onOpenChange={setOpen}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipContent side={side} align={align} panelClassName={panelClassName} aria-hidden={open ? undefined : true}>
          {content}
        </TooltipContent>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
  if (!withProvider) return inner;
  return <TooltipProvider delayDuration={delayMs}>{inner}</TooltipProvider>;
}
