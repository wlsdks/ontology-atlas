"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import { scheduleStateSync } from "./persistence";

/**
 * 아티클 스크롤 컨테이너에서 "맨 위로" 버튼 표시 임계 + 클릭 동작.
 *
 * `use-scroll-spy.ts` 와 같은 컨테이너(`articleScrollRef`)를 구독하지만
 * 관심사가 다르므로(활성 heading 추적 vs 표시 토글) 별도 훅으로 분리 —
 * 기존 스파이 로직을 오염시키지 않는다.
 *
 * 의존성: `dependencyKey`(호출자가 넘기는 `selectedSlug`)가 바뀌면 새 문서로
 * 간주해 visible 을 false 로 재설정하고 리스너를 재부착 — `use-scroll-spy` 의
 * `selectedSlug` 의존성 패턴과 동일 (문서 전환 시 스크롤 컨테이너의 DOM 노드가
 * 아직 붙지 않았을 수 있는 최초 렌더 케이스도 이 재부착으로 해결된다).
 */

export const BACK_TO_TOP_SCROLL_THRESHOLD = 640;

/** 순수 판정 — 테스트 용이성을 위해 훅에서 분리. */
export function shouldShowBackToTop(
  scrollTop: number,
  threshold: number = BACK_TO_TOP_SCROLL_THRESHOLD,
): boolean {
  return scrollTop > threshold;
}

export function useBackToTop(
  scrollRef: RefObject<HTMLElement | null>,
  dependencyKey: string | null,
  threshold: number = BACK_TO_TOP_SCROLL_THRESHOLD,
): { visible: boolean; scrollToTop: () => void } {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    scheduleStateSync(() => setVisible(false));
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      setVisible(shouldShowBackToTop(el.scrollTop, threshold));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollRef, dependencyKey, threshold]);

  const scrollToTop = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
  }, [scrollRef]);

  return { visible, scrollToTop };
}
