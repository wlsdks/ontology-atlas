'use client';

import type { ReactNode } from 'react';

import { useCountUp } from '@/shared/lib/use-count-up';
import { cn } from '@/shared/lib/cn';

/**
 * "A count and what it is made of": an eyebrow, one engraved numeral and its parts. A grammar,
 * not a strip: layout, column count and tile order belong to the composition. `signature` is
 * the insights board's 40px numeral above the type ramp; `section` sits at the display step.
 * Both use the `--map-numeral-*` tokens the topology canvas uses.
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
  /** Sits beside the eyebrow; never a second heading. */
  labelSuffix?: ReactNode;
  children: ReactNode;
  testId?: string;
  /** On the tile, so an assertion reaches the eyebrow and the number together. */
  rowKey?: string;
  /**
   * The `bare` surface drops the card (and `--card-pad`) for the second census on a screen, so
   * surface says which strip the screen is about; the numeral scale stays the same.
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
      {/* A Korean eyebrow carries no tracking: spaced Hangul reads as a stutter. */}
      {/* `break-keep` keeps a narrow Korean label whole (`korean-word-break.spec.ts`). */}
      {/* Wraps the label and ring instead of colliding in a narrow tile; a no-op where it fits. */}
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
  /**
   * The `warning` tone marks a number whose subject is an absence (the one amber allowed), and
   * the `primary` tone takes the ink of a verdict word beside it so the number is not out-ranked.
   */
  tone?: 'numeral' | 'warning' | 'primary';
  testId?: string;
}) {
  /*
   * Counts up once on mount; `tabular-nums` keeps the width stable and `useCountUp` snaps under
   * reduced motion.
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
          : tone === 'primary'
            ? 'text-[color:var(--color-text-primary)]'
            : 'text-[color:var(--map-numeral-face)]',
      )}
      style={tone === 'primary' ? undefined : { textShadow: '0 2px 0 var(--map-numeral-shadow)' }}
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
  /* Wraps under 200% text-only zoom instead of escaping the card (WCAG 1.4.4). */
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
