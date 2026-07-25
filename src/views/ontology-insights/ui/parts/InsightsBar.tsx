import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "@/shared/lib/use-prefers-reduced-motion";

/**
 * 인사이트 분포 막대의 채움 fill(#3 조용한 모션) — 첫 페인트에 width 0 →
 * 목표% 로 --motion-settle 동안 자라며, 행마다 30ms 스태거로 위→아래로
 * 흐른다. reduced-motion 은 처음부터 목표값(애니메이션 없음). track(배경 홈)은
 * 소비처가 소유하고, 이 컴포넌트는 안쪽 fill 만 렌더한다.
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
