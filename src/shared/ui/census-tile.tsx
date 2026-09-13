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
 */

export function CensusTile({
  label,
  labelSuffix,
  children,
  testId = 'census-tile',
  rowKey,
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
}) {
  return (
    <div
      data-testid={testId}
      data-census-row={rowKey}
      className="flex min-w-0 flex-col gap-2.5 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
    >
      {/* The tile name is an eyebrow, and a Korean eyebrow carries no tracking — spaced Hangul
          reads as a stutter, not as emphasis. */}
      <div className="flex items-center gap-1.5 text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
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
  return (
    <span className="inline-flex items-center gap-1.5 text-label text-[color:var(--color-text-tertiary)]">
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
    <div className="flex flex-wrap items-center gap-3.5 text-label text-[color:var(--color-text-tertiary)]">
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
