import { useCallback, useLayoutEffect, useRef, useState } from 'react';

export function useHorizontalOverflowEdges<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [edge, setEdge] = useState({ start: false, end: false });
  const measure = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    const start = element.scrollLeft > 1;
    const end = element.scrollLeft < element.scrollWidth - element.clientWidth - 1;
    setEdge((previous) =>
      previous.start === start && previous.end === end ? previous : { start, end },
    );
  }, []);
  useLayoutEffect(() => {
    measure();
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [measure]);
  const fade = 'var(--tabbar-edge-fade)';
  const mask =
    edge.start && edge.end
      ? `linear-gradient(to right, transparent 0, black ${fade}, black calc(100% - ${fade}), transparent 100%)`
      : edge.end
        ? `linear-gradient(to right, black calc(100% - ${fade}), transparent 100%)`
        : edge.start
          ? `linear-gradient(to right, transparent 0, black ${fade})`
          : undefined;
  return {
    ref,
    onScroll: measure,
    'data-edge-overflow': edge.start && edge.end
      ? 'both'
      : edge.end
        ? 'end'
        : edge.start
          ? 'start'
          : undefined,
    style: mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined,
  };
}
