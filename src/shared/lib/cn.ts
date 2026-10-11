import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Registers our type ramp with tailwind-merge, which otherwise classifies `text-<step>` outside its
 * scale as a colour and drops the size next to `text-[color:...]`. Keep in sync with the `--text-*`
 * ramp in `app/styles/tokens.css` (contract test: `cn.test.ts`).
 */
export const TYPE_RAMP_STEPS = [
  'caption',
  'label',
  'body',
  'body-lg',
  'title',
  // Authored document body: 16px paired with `leading-prose`, the size `--measure-doc-column` is
  // derived at.
  'reading',
  'display',
  'hero',
  'hero-lg',
  // Gateway headline only: clamp(40px, 5.8cqw, 96px); see the `--text-monument` doc-block in
  // `app/styles/tokens.css`.
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
 * Must stay in sync with the `--leading-*` ramp in `app/styles/tokens.css`
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
 * Must stay in sync with the `--radius-*` ramp in `app/styles/tokens.css`
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
