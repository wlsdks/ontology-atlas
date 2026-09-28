import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/shared/lib/cn';

/**
 * The value layer for static, non-pressable badges: class strings only, because a badge has no
 * behaviour for a component to carry. Three shapes, one per measured radius family, each its
 * family's most-used geometry. Geometry only: colour and tracking stay at the site because the
 * inventory found no majority to converge on (60 colour combinations across 67 badges). Status
 * dots, callouts and `EvidenceOnlyBadge` are not consumers.
 * Gates: `tests/contract/badge-class.contract.test.ts`
 * and `tests/contract/static-badge-adoption-ratchet.contract.test.ts`.
 */
const badge = cva('inline-flex flex-none items-center', {
  variants: {
    /** Radius, inset and type step: the measured modal clusters. */
    shape: {
      micro: 'rounded-micro px-1.5 py-0.5 text-caption leading-caption',
      tag: 'rounded-chip px-1.5 text-label leading-label',
      pill: 'rounded-full px-2 py-0.5 text-caption leading-caption',
    },
  },
  defaultVariants: { shape: 'tag' },
});

export type BadgeShape = NonNullable<VariantProps<typeof badge>['shape']>;

export interface BadgeClassOptions extends VariantProps<typeof badge> {
  /** Only what is true of this one site: placement, width, truncation, colour and tracking. */
  className?: string;
}

/**
 * ```tsx
 * <span className={badgeClass({ shape: 'micro' })}>No document</span>
 * ```
 */
export function badgeClass({ className, ...variants }: BadgeClassOptions = {}): string {
  return cn(badge(variants), className);
}
