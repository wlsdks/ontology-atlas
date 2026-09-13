'use client';

import type { ReactNode } from 'react';

import { useCountUp } from '@/shared/lib/use-count-up';
import { cn } from '@/shared/lib/cn';

/**
 * **"Here is a count, and here is what it is made of" — one grammar, in one place.**
 *
 * The insights board has rendered this shape since 2026-09-06: an eyebrow naming the measurement,
 * one large engraved monospace numeral, and the parts of that number beneath it at label size. The
 * owner pointed at that board while reviewing the Harness coverage matrix and said it was at least
 * legible — *while explicitly saying he did not want it copied*. The lesson and the layout are
 * different things: what reads instantly is a card with one large number and its parts, and what
 * does not is a table cell with a tiny coloured square. So the grammar moved here and the Harness
 * tab uses it, rather than a second, weaker version of the same idea being typed out beside it.
 *
 * ⚠️ **This is a grammar, not a strip.** It carries no grid, no column count and no tile order —
 * `InsightsCensusStrip` owns its four-up layout and the Harness coverage view owns its three-up
 * one. Putting the layout in here is how one screen's signature becomes every screen's wallpaper,
 * which is the copy the owner refused.
 *
 * **Two numeral scales, and the difference is registered.** `signature` is the 40px census numeral
 * that deliberately exceeds the top of the type ramp; it is the insights board's own signature and
 * stays that board's. `section` sits at the ramp's display step, for a card that is one part of a
 * screen rather than the screen's masthead. Both engrave with the `--map-numeral-*` tokens the
 * topology canvas uses, so the panel and the canvas stay one world.
 *
 * **One surface option, for the same reason and not a second one.** `panel` is the card; `bare` is
 * the grammar with no card, for the second census on a screen that already has one. The scale says
 * what kind of fact this is; the surface says which reading the screen is about. Anything else —
 * a third scale, a tone, a width — is the composition's business, not this file's.
 */

export function CensusTile({
  label,
  labelSuffix,
  children,
  testId = 'census-tile',
  rowKey,
  surface = 'panel',
}: {
  label: string;
  /** Anything that belongs beside the eyebrow — a hint button, a count. Never a second heading. */
  labelSuffix?: ReactNode;
  children: ReactNode;
  testId?: string;
  /**
   * Which measurement this tile is, for a test that has to name one of several identical tiles.
   * On the tile rather than on an inner wrapper, so an assertion reaches the eyebrow and the
   * number together — the two halves of the claim.
   */
  rowKey?: string;
  /**
   * **One option, and it is about the composition rather than about the tile.**
   *
   * A screen with two census strips has to say which one it is about, and the numeral cannot say
   * it: both strips print the same kind of fact, so both earn the same step. Surface can.
   * Measured on the Harness coverage view at 1512×901, 2026-09-13: the reach strip filled
   * 3 × 442.7 × 130 = 172,653px² of `--color-panel` against the column strip's 207,183px² — 83%
   * of the screen's subject, same border, same 23px numeral, for a different population. `bare`
   * gives up the card and keeps the grammar; it also gives up `--card-pad`, which is what puts a
   * bare strip's labels back on its own heading's left edge instead of 16px inside it.
   *
   * A third numeral scale was rejected for the same job: it would shrink a fact to signal rank.
   */
  surface?: 'panel' | 'bare';
}) {
  return (
    <div
      data-testid={testId}
      data-census-row={rowKey}
      data-census-surface={surface}
      className={cn(
        'flex min-w-0 flex-col gap-2.5',
        surface === 'panel' &&
          'rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]',
      )}
    >
      {/* The tile name is an eyebrow, and a Korean eyebrow carries no tracking — spaced Hangul
          reads as a stutter, not as emphasis. */}
      {/* `break-keep`: at 103px — three of these head the Harness matrix's three columns at 390 —
          Korean broke mid-word, a six-syllable label coming out as two fragments.
          `korean-word-break.spec.ts` owns that rule and `/ko/architecture/` is one of its routes. */}
      {/* `flex-wrap`: at 103px — three of these head the Harness matrix at 390 — the English
          eyebrow's content box is 71.3px against a word plus a 24px ring plus a 6px gap needing
          79px, and `min-w-0` let the label overflow its own box so the declared gap came out at
          **−4.5px** of glyph-on-ring collision (design-responsive, 2026-09-13). A no-op at every
          width where the eyebrow already fits, so no insights tile moves. */}
      <div className="flex flex-wrap items-center gap-1.5 break-keep text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
        <span className="min-w-0">{label}</span>
        {labelSuffix}
      </div>
      {children}
    </div>
  );
}

export function CensusBigNumber({
  value,
  unit,
  suffix,
  scale = 'signature',
  tone = 'numeral',
  testId = 'census-bignum',
}: {
  value: number | string;
  unit?: string;
  suffix?: string;
  scale?: 'signature' | 'section';
  /** `warning` is for a number whose subject is an absence — the one amber this grammar allows. */
  tone?: 'numeral' | 'warning';
  testId?: string;
}) {
  /*
   * The census signature numbers count up once on mount. `tabular-nums` keeps the width stable as
   * the digits change, and reduced motion snaps to the final value — the travel is removed inside
   * `useCountUp`, so nothing here needs a second reduced-motion branch.
   */
  const isNumeric = typeof value === 'number';
  const counted = useCountUp(isNumeric ? value : 0);
  const display = isNumeric ? counted : value;
  return (
    <div
      className={cn(
        'font-mono font-[var(--font-weight-strong)] leading-display-tight tabular-nums tracking-[var(--tracking-label)]',
        scale === 'signature'
          ? // eslint-disable-next-line no-restricted-syntax -- the census signature's large numeral (40px) deliberately exceeds the top of the type ramp (hero 30px) as a display exception.
            'text-[40px]'
          : 'text-display',
        tone === 'warning'
          ? 'text-[color:var(--color-amber-source-a90)]'
          : 'text-[color:var(--map-numeral-face)]',
      )}
      style={{ textShadow: '0 2px 0 var(--map-numeral-shadow)' }}
      data-testid={testId}
    >
      <span aria-hidden="true" data-insights-animated-value>
        {display}
        {suffix ?? ''}
        {unit ? (
          <span
            className="ml-1.5 text-body tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-quaternary)]"
            style={{ textShadow: 'none' }}
          >
            {unit}
          </span>
        ) : null}
      </span>
      <span className="sr-only" data-insights-exact-value>
        {value}
        {suffix ?? ''}
        {unit ? ` ${unit}` : ''}
      </span>
    </div>
  );
}

export function CensusSubStat({
  label,
  value,
  tone = 'numeral',
}: {
  label: string;
  value: number | string;
  tone?: 'numeral' | 'warning';
}) {
  /*
   * `flex-wrap` and `min-w-0`: at 200% text-only zoom on a 390 viewport the Harness cards are 90px
   * wide, and this row's label plus its numeral escaped the card horizontally — content loss under
   * WCAG 1.4.4, measured 2026-09-13. Wrapping costs height, which the card has. A no-op wherever
   * the row already fits.
   */
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5 break-keep text-label text-[color:var(--color-text-tertiary)]">
      {label}
      <span
        className={cn(
          'font-mono text-label tabular-nums',
          tone === 'warning'
            ? 'text-[color:var(--color-amber-source-a90)]'
            : 'text-[color:var(--map-numeral-face)]',
        )}
      >
        {value}
      </span>
    </span>
  );
}

export function CensusSubStrip({
  items,
}: {
  items: Array<{ key: string; label: string; count: number }>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3.5 break-keep text-label text-[color:var(--color-text-tertiary)]">
      {items.map((item) => (
        <span key={item.key} className="inline-flex items-center gap-1.5">
          {item.label}
          <span className="font-mono text-label tabular-nums text-[color:var(--map-numeral-face)]">
            {item.count}
          </span>
        </span>
      ))}
    </div>
  );
}
