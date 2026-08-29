import { useLayoutEffect, useState } from 'react';

/**
 * How many columns `repeat(auto-fill, minmax(<min>px, 1fr))` resolves to at a given width.
 *
 * This is CSS's own arithmetic rather than an approximation of it: auto-fill lays out as many
 * tracks as fit with every track at its minimum, counting the gap between tracks but not after
 * the last one.
 *
 * Why the app needs the number at all (2026-08-28 inspection). The occupant grids previewed a
 * fixed three cards while the installed app's stage resolves to two columns, so every band ended
 * its preview with a half-width hole — the same defect the stat tiles had. A preview that is one
 * full row has to know how wide a row is.
 */
export function gridColumnsForWidth(width: number, minColumn: number, gap: number): number {
  if (!Number.isFinite(width) || width <= 0) return 1;
  if (!(minColumn > 0)) return 1;
  return Math.max(1, Math.floor((width + gap) / (minColumn + gap)));
}

/**
 * Reports the column count an occupant grid resolves to, and the ref to put on the element that
 * carries its width. Remeasures on resize.
 *
 * **It takes a callback ref, not a `RefObject`, on purpose.** The element it must measure is not
 * always on screen at mount: the module column appears only once the asynchronous source walk
 * returns, and a `useLayoutEffect` keyed on a ref object runs while `current` is still null and
 * never runs again. That is not a hypothetical — it shipped, and the installed app kept previewing
 * three cards in a two-column grid until this was found (2026-08-28). Attaching by node state ties
 * the measurement to the element's arrival.
 *
 * `inset` is the horizontal padding between the measured element and the grid itself, for the case
 * where the element that is reliably present is an ancestor of the grid.
 *
 * `useLayoutEffect` runs before paint, so the first measured count is the one drawn — a card is
 * never shown and then taken away. Where nothing can be measured — server render, and jsdom, whose
 * `clientWidth` is always 0 — `fallback` stands in, because narrowing an unmeasured stage to one
 * column would hide cards nobody asked to hide. Real layout always overrides it.
 */
export function useGridColumns(
  minColumn: number,
  gap: number,
  { inset = 0, fallback = 1 }: { inset?: number; fallback?: number } = {},
): readonly [(node: HTMLElement | null) => void, number] {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [columns, setColumns] = useState(fallback);

  useLayoutEffect(() => {
    if (!node) return;
    const read = () => {
      const width = node.clientWidth - inset;
      if (width <= 0) return;
      setColumns(gridColumnsForWidth(width, minColumn, gap));
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, minColumn, gap, inset]);

  return [setNode, columns] as const;
}
