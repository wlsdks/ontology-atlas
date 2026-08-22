import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Registering our type ramp with tailwind-merge, which otherwise classifies any
 * `text-<step>` outside its own scale as a **colour**.
 *
 * Root cause of an owner report, 2026-07-23 ("the chrome text is too large"):
 * `text-label` / `text-body` were misread as colours, "conflicted" with a
 * following `text-[color:…]` arbitrary value, and were dropped silently — those
 * surfaces had been rendering at the root 16px. Found by measuring chrome pills.
 *
 * Must stay in sync with the `--text-*` ramp in `app/globals.css`: a new step
 * there needs a new step here (contract test: `cn.test.ts`).
 */
export const TYPE_RAMP_STEPS = [
  'caption',
  'label',
  'body',
  'body-lg',
  'title',
  'display',
  'hero',
  'hero-lg',
  // Gateway headline only (2026-08-18): clamp(40px, 5.8cqw, 96px), proportional
  // to the measure. Values and the glyph-budget arithmetic are in the
  // `--text-monument` doc-block in `app/globals.css`.
  'monument',
] as const;

/**
 * Same discipline as the type ramp, but the failure looks different and is harder
 * to find. tailwind-merge does not misclassify the `leading-` prefix, so nothing
 * is dropped; it simply does not recognise a custom step, so **no conflict merge
 * happens** — in `cn('leading-body', cond && 'leading-prose')` both survive and
 * CSS source order picks the winner. A conditional branch silently losing to the
 * value it meant to override.
 *
 * Must stay in sync with the `--leading-*` ramp in `app/globals.css`
 * (contract test: `cn.test.ts`).
 */
export const LEADING_RAMP_STEPS = [
  'caption',
  'label',
  'body',
  'body-lg',
  'title',
  'display',
  'hero',
  'hero-lg',
  'monument',
  'display-tight',
  'prose',
] as const;

/**
 * Same failure mode as the leading ramp: an unrecognised `rounded-<step>` never
 * merges, so both classes survive and CSS source order decides. The merge became
 * load-bearing when the value layer (`control-class.ts`) started compounding a
 * size radius over a shape's base radius.
 *
 * Must stay in sync with the `--radius-*` ramp in `app/globals.css`
 * (contract test: `cn.test.ts`).
 */
export const RADIUS_RAMP_STEPS = ['micro', 'chip', 'card', 'panel', 'sheet'] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: [...TYPE_RAMP_STEPS] }],
      leading: [{ leading: [...LEADING_RAMP_STEPS] }],
      rounded: [{ rounded: [...RADIUS_RAMP_STEPS] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
