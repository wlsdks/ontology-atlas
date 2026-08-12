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
  // Start at the target when there's nothing to animate (reduced motion, or no
  // rAF as on the server) so no synchronous setState is needed in the effect.
  const canAnimate = !reduce && typeof requestAnimationFrame === "function";
  const [value, setValue] = useState(canAnimate ? 0 : target);
  const introDone = useRef(false);
  const synced = useRef(false);
  /**
   * ★ 인트로 루프는 **이 ref 를 통해** target 을 읽는다 (2026-08-12 실측 회귀).
   *
   * 종전에는 마운트 클로저에 잡힌 target 을 향해 달렸다. 분석 화면의 첫 렌더는
   * 내장 견본(125 노드)이고 사용자 볼트(5 노드)는 그 인트로 400ms **안에**
   * 도착한다 — 아래 동기화 이펙트가 5 로 스냅해도 다음 프레임이 125 를 향한
   * 값으로 되덮었고, 125 에 정착한 뒤에는 target 이 다시 안 바뀌므로 화면이
   * 영원히 125 였다. 같은 화면의 종류 분포·상단 칩은 5 를 말하고 있었다.
   */
  const targetRef = useRef(target);
  // 렌더 중 ref 쓰기는 lint 가 막는다 — 이펙트로 갱신해도 늦지 않다: 이펙트는
  // 커밋 직후, 다음 rAF 프레임보다 먼저 돌므로 인트로 루프가 항상 최신 값을 본다.
  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  useEffect(() => {
    if (introDone.current) return;
    introDone.current = true;
    if (!canAnimate) return; // already at target
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic — quick then settle
      setValue(Math.round(targetRef.current * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else setValue(targetRef.current);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // Intro runs exactly once (guarded by introDone); duration read at mount and
    // the live target arrives through targetRef.
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
