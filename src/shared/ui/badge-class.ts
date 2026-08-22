import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/shared/lib/cn';

/**
 * **The value layer for static badges** — the single source of class strings for
 * small non-pressable marks (ratified by the design-systems seat, 2026-08-15).
 *
 * **Why a value layer and not a component**, following the split `controlClass`
 * established (values are a function, behaviour is a component): a static badge
 * has zero behaviour — it is not pressable and has no focus, disabled or touch
 * floor. There is nothing for a component to carry, so a component wrapper would
 * just reproduce the `Badge` that died on 2026-08-03.
 *
 * **Is this rebuilding the dead `Badge`? The cause of death was different.**
 * `Card`, `Badge` and `DetailCard` were deleted with **0 consumers**
 * (2026-08-03), but the post-mortem in `control-class.ts`'s header corrected
 * itself the same day: what failed was **components without a gate**. Three
 * controls today are the counter-example — Dialog, Checkbox and SegmentedControl
 * were all born carrying their migration and their ratchet **in the same round**,
 * and all three are alive. So this file does not arrive alone: 22 migrated sites,
 * an adoption ratchet, a combination contract and the routing note ship in the
 * same PR.
 *
 * **The axis was derived from measurement** (inventory 2026-08-15: 67 badges ·
 * 36 files · 30 distinct geometries · 60 distinct colour combinations):
 *
 * | shape | radius family | value (that family's modal geometry) | byte-identical |
 * |---|---:|---|---:|
 * | `pill` | full 28 | `rounded-full` + `px-2 py-0.5` + caption | **10** |
 * | `micro` | micro 20 | `rounded-micro` + `px-1.5 py-0.5` + caption | **7** |
 * | `tag` | chip 19 | `rounded-chip` + `px-1.5 py-0` + label | **5** |
 *
 * The three radius families are not drift — they mean **there are three shapes**
 * (all three populations are double digits). Each shape's value is the most-used
 * geometry in its family, which is why the 22 migrations move **0 pixels**.
 *
 * **0 new tokens, 0 new values.** The variance was at the level of
 * **combinations**, not values: every component value was already on a ramp, and
 * what was missing was one place that emits them.
 *
 * **⚠️ The tone and caps axes are deliberately absent — colour had no majority to
 * converge on.** The seat's ratification asked for a colour inventory and a tone
 * axis; the inventory said not to build one:
 *
 * | What | Distinct combinations | Largest cluster |
 * |---|---:|---:|
 * | **Geometry** (radius · inset · type step) | 30 | 10 |
 * | **Colour** (border / background / ink) | **60** | **2** |
 *
 * 60 colour combinations across 67 badges is effectively one per site. Whatever
 * value were chosen would have ≤2 consumers, so making tone an axis means
 * **creating three options with 0 consumers** — the lineage of `fixedHeight`, and
 * the cause of the 8–9 control heights on one screen. Tracking for uppercase
 * eyebrows is the same: caps-08 13 · caps-10 6 · caps-12 5, so fixing one would
 * itself be a pixel move.
 *
 * So this layer **owns geometry only and leaves colour and tracking at the
 * site**. Converging colour is not a value question but a **per-site design
 * verdict** (what should be indigo depends on which fact that badge carries), and
 * that verdict belongs to the next round. Until then the ratchet holds the total
 * — changing everything at once makes it impossible to tell what caused a screen
 * to differ (the fix-order contract in `/design-system-audit`).
 *
 * `danger`/`success` are absent for the same reason: 0 sites use them as static
 * badges (the 4 the inventory turned up were 2 callouts, 1 status dot and 1
 * floating banner, none of them badges).
 *
 * **What this layer does not cover:**
 *
 * - **Status dots** (`rounded-full` + `size-1~3`, no text) — they have their own
 *   signal-tone spec and are not badges.
 * - **Callouts** (`MtimeConflictBadge` and friends: `role="status"` + a
 *   `px-2 py-1.5` tint block) — the name says badge but **the anatomy differs**,
 *   and forcing them onto the badge ramp would pollute the axis (explicitly
 *   excluded by the seat).
 * - **`EvidenceOnlyBadge`** — its `px-1` + `text-label` is a documented
 *   derivation of "do not disturb the row height", so it snaps only if
 *   byte-identical (seat condition 3). It is not a consumer of this layer, and
 *   the ratchet's registry carries that fact.
 *
 * Gates: `tests/contract/badge-class.contract.test.ts` (all combinations) ·
 * `tests/contract/static-badge-adoption-ratchet.contract.test.ts` (total number
 * of hand-written badges).
 */
const badge = cva('inline-flex flex-none items-center', {
  variants: {
    /** Geometry — radius · inset · type step. All three are the measured modal clusters (table above). */
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
  /**
   * Only what is true of this one site — placement, width, truncation, and
   * **colour and tracking**. Taking colour here is not a stopgap but the result
   * of the measurement above: there is no majority to converge on.
   */
  className?: string;
}

/**
 * Returns the className for a static badge.
 *
 * ```tsx
 * <span className={badgeClass({ shape: 'pill', className: 'bg-[color:var(--color-indigo-a12)] text-[color:var(--color-indigo-text-soft)]' })}>Draft</span>
 * <span className={badgeClass({ shape: 'micro' })}>No document</span>
 * ```
 */
export function badgeClass({ className, ...variants }: BadgeClassOptions = {}): string {
  return cn(badge(variants), className);
}
