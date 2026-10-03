import { useEffect, useState, type CSSProperties } from "react";
import { usePrefersReducedMotion } from "@/shared/lib/use-prefers-reduced-motion";
import { STAGGER_MAX_STEPS } from '@/shared/motion/stagger';

/**
 * A question's fill scales on the shared settle clock and capped stagger;
 * reduced motion paints the target immediately. The consumer owns the track.
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
  const [filled, setFilled] = useState(reduce);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <span
      className="block h-full rounded-full"
      data-testid={testId}
      data-insights-fill={pct}
      style={{
        "--motion-stagger-index": reduce ? 0 : Math.min(Math.max(index, 0), STAGGER_MAX_STEPS),
        width: "100%",
        transform: `scaleX(${filled || reduce ? pct / 100 : 0})`,
        transformOrigin: "left",
        backgroundColor: color,
        transitionProperty: reduce ? "none" : "transform",
        transitionDuration: "var(--motion-settle)",
        transitionTimingFunction: "var(--motion-ease)",
        transitionDelay: "calc(var(--motion-stagger) * var(--motion-stagger-index))",
      } as CSSProperties}
    />
  );
}
