import type { ReactNode } from "react";

export interface ShareStackItem {
  id: string;
  label: string;
  count: number;
  /** A colour token or a computed tone; it must clear 3:1 on the panel (WCAG 1.4.11). */
  color: string;
  /** A glyph or trace mark that ties the key item to the map's own drawing. */
  mark?: ReactNode;
}

/**
 * **One share band for every "what is this made of" card** (kinds on Composition, relation types
 * on Relations): one stacked bar, then one key that names each segment once — swatch, the map's
 * own mark, name, count, share.
 *
 * The kinds card drew the stacked bar *and* a row per kind with a second bar for the same share,
 * so four rows beside the taller domain card left a 41-103px blank band above its caption
 * (review, 2026-09-25). Relations had already dropped its per-type rows for this band; the two
 * cards now say their one fact in one grammar, and the card is as tall as what it says.
 *
 * ⚠️ **Segments are separated by the panel, not by a border.** The bar used to wear a divider
 * border around a gapless run, so a pale segment beside the border read as the empty track and
 * the bar seemed to end early. The seam between segments is the panel itself (`gap-0.5`), so
 * each segment is bounded by a colour-independent edge, and every tone passed in is chosen to
 * clear 3:1 against that panel.
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
            // `min-w-1`: a one-item share still shows as a mark; its exact value is in the key.
            className="min-w-1"
            style={{ flexGrow: item.count / total, flexBasis: 0, backgroundColor: item.color }}
          />
        ))}
      </div>
      <ul data-testid={keyTestId} className="mt-3 mb-3 flex flex-wrap gap-x-8 gap-y-2">
        {items.map((item) => {
          const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
          return (
            <li key={item.id} className="flex min-h-7 items-center gap-2">
              <span aria-hidden className="size-2.5 flex-none rounded-micro" style={{ backgroundColor: item.color }} />
              {item.mark}
              <span className="text-body text-[color:var(--color-text-primary)]">{item.label}</span>
              <span className="font-mono text-body tabular-nums text-[color:var(--map-numeral-face)]">{item.count}</span>
              <span className="text-label tabular-nums text-[color:var(--color-text-tertiary)]">{pct}%</span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
