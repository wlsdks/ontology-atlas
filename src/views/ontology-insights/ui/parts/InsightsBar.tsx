import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "@/shared/lib/use-prefers-reduced-motion";

/**
 * The fill of an insights distribution bar — on first paint it grows from width 0 to the target
 * percentage over `--motion-settle`, staggered 30ms per row so it flows top to bottom. Under
 * reduced-motion it starts at the target value with no animation. The track (the background groove)
 * is owned by the consumer; this component renders only the inner fill.
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
  // Under reduced motion `filled` starts at the target (no visible 0). Otherwise
  // it starts at 0 and flips to the target on the next frame so the CSS width
  // transition runs from empty — the flip lives in the rAF callback (not the
  // effect body) so it never cascades a synchronous re-render.
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
