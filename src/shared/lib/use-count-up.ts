import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";

/**
 * 마운트 시 0 → target 로 한 번 세는 카운트업(#3 인사이트 조용한 모션).
 *
 * - **once**: 인트로 애니메이션은 마운트당 한 번만. 이후 target 이 바뀌면(데이터
 *   갱신) 즉시 스냅 — 다시 세지 않는다.
 * - **레이아웃 안정**: 소비처는 `tabular-nums` 로 렌더해 자릿수 변화가 폭을
 *   흔들지 않게 한다.
 * - **reduced-motion**: 즉시 최종값(애니메이션 없음).
 */
export function useCountUp(target: number, durationMs = 400): number {
  const reduce = usePrefersReducedMotion();
  const [value, setValue] = useState(reduce ? target : 0);
  const introDone = useRef(false);
  const synced = useRef(false);

  useEffect(() => {
    if (introDone.current) return;
    introDone.current = true;
    if (reduce || typeof requestAnimationFrame !== "function") {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic — quick then settle
      setValue(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else setValue(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // Intro runs exactly once (guarded by introDone); target/duration read at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After mount, keep the displayed value synced to later target changes (skip
  // the initial run so it never clobbers the intro animation).
  useEffect(() => {
    if (!synced.current) {
      synced.current = true;
      return;
    }
    setValue(target);
  }, [target]);

  return value;
}
