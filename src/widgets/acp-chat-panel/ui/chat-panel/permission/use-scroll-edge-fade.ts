'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const EDGE_FADE = 'var(--tabbar-edge-fade)';

/**
 * Fades the edge of a scroll box that has more content beyond it. Attach `scrollRef` to the box and
 * `contentRef` to its inner wrapper; `edge` and `mask` follow scrolling and resizing of either.
 */
export function useScrollEdgeFade() {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [edge, setEdge] = useState({ top: false, bottom: false });
  const measure = useCallback(() => {
    const box = scrollRef.current;
    if (!box) return;
    const top = box.scrollTop > 1;
    const bottom = box.scrollTop < box.scrollHeight - box.clientHeight - 1;
    setEdge((previous) => (previous.top === top && previous.bottom === bottom ? previous : { top, bottom }));
  }, []);
  useEffect(() => {
    const box = scrollRef.current;
    const content = contentRef.current;
    if (!box || !content) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(content);
    return () => observer.disconnect();
  }, [measure]);
  const mask =
    edge.top && edge.bottom
      ? `linear-gradient(to bottom, transparent 0, black ${EDGE_FADE}, black calc(100% - ${EDGE_FADE}), transparent 100%)`
      : edge.bottom
        ? `linear-gradient(to bottom, black calc(100% - ${EDGE_FADE}), transparent 100%)`
        : edge.top
          ? `linear-gradient(to bottom, transparent 0, black ${EDGE_FADE})`
          : undefined;

  return { scrollRef, contentRef, edge, measure, mask };
}
