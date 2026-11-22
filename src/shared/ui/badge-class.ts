import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/shared/lib/cn';

/**
 * The value layer for static, non-pressable badges: class strings only. Three shapes, one per measured
 * radius family. Geometry only: colour and tracking stay at the site because the inventory found no
 * majority (60 colour combinations across 67 badges). Status dots and callouts are not consumers.
 */
const badge = cva('inline-flex flex-none items-center', {
  variants: {
    shape: {
      micro: 'rounded-micro px-1.5 py-0.5 text-caption leading-caption',
      tag: 'rounded-chip px-1.5 text-label leading-label',
      pill: 'rounded-full px-2 py-0.5 text-caption leading-caption',
    },
  },
  defaultVariants: { shape: 'tag' },
});

export interface BadgeClassOptions extends VariantProps<typeof badge> {
  className?: string;
}

export function badgeClass({ className, ...variants }: BadgeClassOptions = {}): string {
  return cn(badge(variants), className);
}
