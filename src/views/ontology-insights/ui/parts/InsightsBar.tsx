import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "@/shared/lib/use-prefers-reduced-motion";

/**
 * An insights bar's fill, growing from 0 over `--motion-settle`, staggered 30ms per row; reduced motion starts at
 * the target. The consumer owns the track.
 */
export function InsightsBar({
  pct,
  color,
  index = 0,
  testId,
}: {
  pct: number;
  color: string;
  index?: number;
  testId?: string;
}) {
  const reduce = usePrefersReducedMotion();
  // Starts at the target under reduced motion; otherwise it flips to the target in the next frame's rAF callback,
  // so the width transition runs from empty without a synchronous re-render.
  const [filled, setFilled] = useState(reduce);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <span
      className="block h-full rounded-full"
      data-testid={testId}
      style={{
        width: filled ? `${pct}%` : "0%",
        backgroundColor: color,
        transitionProperty: "width",
        transitionDuration: "var(--motion-settle)",
        transitionTimingFunction: "var(--motion-ease)",
        transitionDelay: `${index * 30}ms`,
      }}
    />
  );
}
