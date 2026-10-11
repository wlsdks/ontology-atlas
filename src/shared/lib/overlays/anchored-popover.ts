/**
 * Where a popover that hangs under its trigger goes, inside a boundary it may not leave.
 *
 * Owner report, 2026-09-25 (installed app, 1512): the map's constellation popover hung off
 * the trigger's right edge with a fixed 320px width. From `xl` the search lane holds the free
 * map's left edge, so the popover ran 284px left of the trigger and over the INDEX panel (and
 * over the collapsed INDEX tab when INDEX was folded). A fixed alignment cannot know where
 * the free map ends; this does, from measured rectangles.
 *
 * The rule: the popover's near edge lines up with the trigger's near edge, on the side with
 * more room (so it grows away from the boundary it is closest to), then shifts — never
 * flips past the trigger — until it sits inside the boundary with one inset to spare. When
 * the boundary is narrower than the preferred width the popover shrinks to fit it. The
 * transform origin points at the trigger's centre, so the entrance grows out of the control
 * that invoked it wherever the clamp put the box.
 */
interface PopoverRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface AnchoredPopoverInput {
  trigger: PopoverRect;
  /** The region the popover must stay inside (the free map, not the viewport). */
  boundary: PopoverRect;
  /** Preferred width in px. */
  width: number;
  /** Space kept between the popover and the boundary's edges. */
  inset: number;
  /** Space between the trigger's bottom and the popover's top. */
  gap: number;
}

export interface AnchoredPopoverPlacement {
  /** Viewport coordinates of the popover's left edge and top. */
  left: number;
  top: number;
  width: number;
  /** Which edge of the trigger the popover's matching edge follows before any clamp. */
  align: 'start' | 'end';
  /** `transform-origin` x relative to the popover's own left edge. */
  originX: number;
}

export function placeAnchoredPopover(input: AnchoredPopoverInput): AnchoredPopoverPlacement {
  const { trigger, boundary, inset, gap } = input;
  const minLeft = boundary.left + inset;
  const maxRight = boundary.right - inset;
  const width = Math.max(0, Math.min(input.width, maxRight - minLeft));
  const roomAfter = maxRight - trigger.left;
  const roomBefore = trigger.right - minLeft;
  // Start-aligned (grows rightward from the trigger's left edge) when that fits or has at
  // least as much room as the other side; end-aligned otherwise.
  const align: 'start' | 'end' = roomAfter >= width || roomAfter >= roomBefore ? 'start' : 'end';
  const preferred = align === 'start' ? trigger.left : trigger.right - width;
  const left = Math.min(Math.max(preferred, minLeft), maxRight - width);
  const top = trigger.bottom + gap;
  const triggerCentre = (trigger.left + trigger.right) / 2;
  return {
    left,
    top,
    width,
    align,
    originX: Math.min(Math.max(triggerCentre - left, 0), width),
  };
}
