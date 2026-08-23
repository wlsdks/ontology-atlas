"use client";

import {
  type ComponentPropsWithoutRef,
  type ReactNode,
  forwardRef,
} from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

/**
 * A tooltip wrapper built on Radix UI.
 *
 * Used instead of the HTML `title` attribute: it works with touch, keeps styling
 * consistent, and shows on keyboard focus. A site needing a single mount uses the
 * `Tooltip` component; several tooltips in one tree need `TooltipProvider`
 * wrapped once.
 *
 * Follows the design charter:
 * - solid neutral panel (rgba 0,0,0 alpha) + indigo border alpha
 * - no glow, scale, or gradient
 * - sideOffset 6 + small radius
 *
 * Usage:
 *   <Tooltip content="Centered">
 *     <button>...</button>
 *   </Tooltip>
 */
export const TooltipProvider = TooltipPrimitive.Provider;

export const TooltipContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={
      className ??
      "z-[var(--z-tooltip)] rounded-chip border border-[color:var(--color-indigo-a32)] bg-[color:var(--color-panel)] px-2 py-1 text-label text-[color:var(--color-text-primary)] shadow-[var(--shadow-elevation-1)] data-[state=delayed-open]:animate-in data-[state=closed]:animate-out"
    }
    {...props}
  />
));
TooltipContent.displayName = "TooltipContent";

export interface TooltipProps {
  /** Tooltip text. A ReactNode works, but a heavy tree is discouraged (a11y aria-label). */
  content: ReactNode;
  /** The trigger element — usually a button, Link, or icon. */
  children: ReactNode;
  /** Radix side; defaults to 'top'. */
  side?: TooltipPrimitive.TooltipContentProps["side"];
  /** True (the default) for one-off use with no Provider of its own. Set false
   *  when the tree already has a `TooltipProvider`, to avoid wrapping twice. */
  withProvider?: boolean;
  /** Show delay in ms; defaults to 300. */
  delayMs?: number;
}

/**
 * One-off use — a single wrapper that includes the provider.
 *
 * For many sites, place `<TooltipProvider>` once in a parent layout and use this
 * component with `withProvider={false}` to avoid duplicate DOM.
 */
export function Tooltip({
  content,
  children,
  side = "top",
  withProvider = true,
  delayMs = 300,
}: TooltipProps) {
  const inner = (
    <TooltipPrimitive.Root delayDuration={delayMs}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipContent side={side}>{content}</TooltipContent>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
  if (!withProvider) return inner;
  return <TooltipProvider delayDuration={delayMs}>{inner}</TooltipProvider>;
}
