'use client';

import { useCallback, useLayoutEffect, useRef, useState, type RefCallback } from 'react';

export function useInspectorClearance(): RefCallback<HTMLElement> {
  const panelRef = useRef<HTMLElement | null>(null);
  const [version, setVersion] = useState(0);
  const attach = useCallback((node: HTMLElement | null) => {
    panelRef.current = node;
    setVersion(value => value + 1);
  }, []);
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const toolbar = document.querySelector<HTMLElement>('[data-popover-boundary="free-map"]');
    if (!toolbar) return;
    const desktop = window.matchMedia('(min-width: 64rem)');
    let frame = 0;
    const position = () => {
      frame = 0;
      if (!desktop.matches) {
        panel.style.removeProperty('top');
        panel.style.removeProperty('max-height');
        return;
      }
      const scale = Number(getComputedStyle(panel).zoom) || 1;
      const inset = parseFloat(getComputedStyle(toolbar).rowGap) || 0;
      const top = toolbar.getBoundingClientRect().bottom / scale + inset;
      panel.style.top = `${top}px`;
      panel.style.maxHeight = `calc(100dvh / ${scale} - ${top}px - var(--map-panel-bottom-reserve))`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(position);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(toolbar);
    window.addEventListener('resize', schedule);
    desktop.addEventListener('change', schedule);
    position();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      desktop.removeEventListener('change', schedule);
      if (frame) cancelAnimationFrame(frame);
      panel.style.removeProperty('top');
      panel.style.removeProperty('max-height');
    };
  }, [version]);
  return attach;
}
