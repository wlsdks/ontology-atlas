import type { ReactNode } from "react";

export interface ShareStackItem {
  id: string;
  label: string;
  count: number;
  /** A colour token or computed tone that clears 3:1 on the panel (WCAG 1.4.11). */
  color: string;
  /** A CSS `background` replacing the flat colour on both segment and swatch (a hatch). */
  fill?: string;
  /** A glyph or trace mark tying the key item to the map's drawing. */
  mark?: ReactNode;
}

/**
 * One share band for every "what is this made of" card (kinds, relation types): a stacked bar, then a key naming
 * each segment once with swatch, mark, name and share; counts live in the census strip. Segments are separated by
 * the panel (`gap-0.5`), not a border, so a pale segment is never read as the empty track.
 */
export function ShareStack({
  items,
  total,
  testId,
  segmentTestId,
  keyTestId,
}: {
  items: readonly ShareStackItem[];
  total: number;
  testId?: string;
  segmentTestId?: string;
  keyTestId?: string;
}) {
  const shown = items.filter((item) => item.count > 0 && total > 0);
  return (
    <>
      <div aria-hidden data-testid={testId} className="mt-3 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full">
        {shown.map((item) => (
          <span
            key={item.id}
            data-testid={segmentTestId}
            // Keeps a one-item share visible as a mark (`min-w-1`); the key states its value.
            className="min-w-1"
            style={{ flexGrow: item.count / total, flexBasis: 0, background: item.fill ?? item.color }}
          />
        ))}
      </div>
      <ul data-testid={keyTestId} className="mt-3 mb-3 flex flex-wrap gap-x-8 gap-y-2">
        {items.map((item) => {
          const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
          return (
            // Name and share sit 6px apart and the next item 32px away, so each reads as one item. The key says the share,
            // not the count, which the census strip prints; the count stays for a listener.
            <li key={item.id} className="flex min-h-7 items-center gap-1.5" data-share-count={item.count}>
              <span aria-hidden className="mr-0.5 size-2.5 flex-none rounded-micro" style={{ background: item.fill ?? item.color }} />
              {item.mark}
              <span className="text-body text-[color:var(--color-text-primary)]">{item.label}</span>
              <span className="font-mono text-body tabular-nums text-[color:var(--map-numeral-face)]" aria-hidden>{pct}%</span>
              <span className="sr-only">{`${item.count} · ${pct}%`}</span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
