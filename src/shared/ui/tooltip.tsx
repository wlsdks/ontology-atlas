"use client";

import {
  type ComponentPropsWithoutRef,
  type ReactNode,
  forwardRef,
} from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/shared/lib/cn";

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

const TooltipContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> & { panelClassName?: string }
>(({ className, panelClassName, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      className ??
        "z-[var(--z-tooltip)] rounded-chip border border-[color:var(--color-indigo-a32)] bg-[color:var(--color-panel)] px-2 py-1 text-label text-[color:var(--color-text-primary)] shadow-[var(--shadow-elevation-1)] data-[state=delayed-open]:animate-in data-[state=closed]:animate-out",
      panelClassName,
    )}
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
  /**
   * Radix alignment along that side; Radix's own default is `center`.
   *
   * `start` is what a panel hanging under a small glyph needs: centred on a 24px trigger
   * it straddles it, and against a column edge the collision logic then slides it back,
   * which reads as a box that landed somewhere arbitrary.
   */
  align?: TooltipPrimitive.TooltipContentProps["align"];
  /** True (the default) for one-off use with no Provider of its own. Set false
   *  when the tree already has a `TooltipProvider`, to avoid wrapping twice. */
  withProvider?: boolean;
  /** Show delay in ms; defaults to 300. */
  delayMs?: number;
  /**
   * Extra classes **appended** to the panel's own — not a replacement for them.
   *
   * The one consumer today is `pointer-events-none`, for a panel that opens across a
   * control a hand travels to next (the Library's index head). Radix keeps the content
   * mounted through its exit animation, so `disableHoverableContent` alone still leaves
   * a window in which the box answers `elementFromPoint` over that control; a panel with
   * nothing to reach in it loses nothing by being unpointable. Kept as an append rather
   * than the `className` override `TooltipContent` already has, because that one drops
   * the panel's whole appearance — surface, border, radius, type — on the floor.
   */
  panelClassName?: string;
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
  align,
  withProvider = true,
  delayMs = 300,
  panelClassName,
}: TooltipProps) {
  const inner = (
    <TooltipPrimitive.Root delayDuration={delayMs}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipContent side={side} align={align} panelClassName={panelClassName}>
          {content}
        </TooltipContent>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
  if (!withProvider) return inner;
  return <TooltipProvider delayDuration={delayMs}>{inner}</TooltipProvider>;
}
