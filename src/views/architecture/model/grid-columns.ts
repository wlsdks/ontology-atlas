import { useLayoutEffect, useState } from 'react';

/**
 * Column count of `repeat(auto-fill, minmax(<min>px, 1fr))` at a width, by CSS's own arithmetic:
 * the gap counts between tracks but not after the last. A one-row preview needs it.
 */
export function gridColumnsForWidth(width: number, minColumn: number, gap: number): number {
  if (!Number.isFinite(width) || width <= 0) return 1;
  if (!(minColumn > 0)) return 1;
  return Math.max(1, Math.floor((width + gap) / (minColumn + gap)));
}

/**
 * A callback ref, because the measured element may mount after the hook and a ref-keyed layout effect
 * would never re-run. `inset` is the padding between that element and the grid; `fallback` stands in
 * where layout is unmeasurable (server, jsdom) rather than narrowing to one column.
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
