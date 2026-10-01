"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useState, type CSSProperties } from "react";

import { SPRING, springEasing, springSettleMs } from "./spring";

type IndicatorShape = "underline-x" | "surface-x" | "surface-y";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function sameBox(a: Box | null, b: Box | null): boolean {
  return !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

const CONTROL_TIMING: CSSProperties = {
  transitionDuration: `${springSettleMs(SPRING.control)}ms`,
  transitionTimingFunction: springEasing(SPRING.control),
};
const FAST_TIMING: CSSProperties = {
  transitionDuration: "var(--motion-fast)",
  transitionTimingFunction: "var(--motion-ease)",
};

function styleFor(box: Box, shape: IndicatorShape, speed: "base" | "fast"): CSSProperties {
  const timing = speed === "fast" ? FAST_TIMING : CONTROL_TIMING;
  if (shape === "underline-x") {
    return { ...timing, width: 1, transform: `translate(${box.x}px, ${box.y + box.h}px) scaleX(${box.w})` };
  }
  return { ...timing, width: box.w, height: box.h, transform: `translate(${box.x}px, ${box.y}px)` };
}

export function useSlidingIndicator(
  activeKey: string | null,
  shape: IndicatorShape,
  speed: "base" | "fast" = "base",
): {
  containerRef: (el: HTMLElement | null) => void;
  itemRef: (key: string) => (el: HTMLElement | null) => void;
  indicatorStyle: CSSProperties | undefined;
  placed: boolean;
  animated: boolean;
} {
  const group = useId();
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [animated, setAnimated] = useState(false);

  const measure = useCallback(() => {
    const el =
      activeKey === null || !container
        ? null
        : Array.from(container.querySelectorAll<HTMLElement>("[data-indicator-item]")).find(
            (item) => item.dataset.indicatorItem === `${group}:${activeKey}`,
          );
    if (!el || !container) {
      setBox(null);
      return;
    }
    const c = container.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const next = {
      x: r.left - c.left - container.clientLeft + container.scrollLeft,
      y: r.top - c.top - container.clientTop + container.scrollTop,
      w: r.width,
      h: r.height,
    };
    setBox((prev) => (sameBox(prev, next) ? prev : next));
  }, [activeKey, container, group]);

  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    measure();
  }, [measure]);

  useEffect(() => {
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(container);
    for (const el of container.querySelectorAll("[data-indicator-item]")) observer.observe(el);
    return () => observer.disconnect();
  }, [container, measure]);

  const placed = box !== null;
  useEffect(() => {
    if (!placed || animated) return;
    const frame = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(frame);
  }, [placed, animated]);

  const itemRef = useCallback(
    (key: string) => (el: HTMLElement | null) => {
      if (el) el.dataset.indicatorItem = `${group}:${key}`;
    },
    [group],
  );

  return {
    containerRef: setContainer,
    itemRef,
    indicatorStyle: box ? styleFor(box, shape, speed) : undefined,
    placed,
    animated: placed && animated,
  };
}
