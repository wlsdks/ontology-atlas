"use client";

import { useEffect, useRef, useState } from "react";
import { scheduleStateSync } from "./persistence";

/**
 * DocsVaultPage 의 article 스크롤 컨테이너에서 현재 heading 추적.
 *
 * rAF 스로틀 scroll 핸들러가 heading 들의 root 상대 위치를 재계산해, 스크롤
 * 상단(32px 기준선)을 가장 최근에 지나간 heading 을 active 로 고른다. 아직
 * 어떤 heading 도 지나지 않았으면(문서 최상단) null, 최하단 도달 시 마지막
 * heading 클램프.
 *
 * 이전 구현은 IntersectionObserver 기반이었는데 세 가지 잠복 결함이 있었다:
 * ① 비동기 마크다운 fetch 전에 한 번만 heading 을 조회해 observer 가 영영 안
 * 붙음 ② React 재렌더가 article DOM 을 교체하면 detached 노드를 계속 관찰
 * ③ 점프 스크롤이 관찰 밴드를 건너뛰면 콜백이 안 옴. heading 은 문서당
 * 수 개 수준이라 스크롤마다의 직접 재계산이 더 단순하고 결정론적이다.
 * ①·②는 MutationObserver 상시 유지 + 재수집으로 방어한다.
 *
 * 의존성:
 * - `selectedSlug` 가 바뀌면 active null 로 초기화 (새 문서)
 * - `source` ('server' | 'local') 가 바뀌면 article DOM 이 다시 그려지므로 재구독
 *
 * 반환:
 * - `articleScrollRef` — article 컨테이너 div ref (caller 가 부착)
 * - `activeHeadingSlug` — 현재 active heading 의 id (또는 null)
 * - `setActiveHeadingSlug` — 외부 click 으로 즉시 active 갱신 (스크롤 애니메
 *   이션 도착 전에 indicator 를 미리 옮길 때)
 *
 * 호출자: `DocsVaultContent` 의 outline panel + 읽기 목차 레일.
 */
export function useDocsVaultScrollSpy(
  selectedSlug: string | null,
  source: string,
): {
  articleScrollRef: React.MutableRefObject<HTMLDivElement | null>;
  activeHeadingSlug: string | null;
  setActiveHeadingSlug: React.Dispatch<React.SetStateAction<string | null>>;
} {
  const articleScrollRef = useRef<HTMLDivElement | null>(null);
  const [activeHeadingSlug, setActiveHeadingSlug] = useState<string | null>(
    null,
  );
  useEffect(() => {
    scheduleStateSync(() => setActiveHeadingSlug(null));
    if (!selectedSlug) return;
    const root = articleScrollRef.current;
    if (!root) return;

    let headings: HTMLElement[] = [];
    let rafPending = 0;

    const collectHeadings = (): boolean => {
      headings = Array.from(
        root.querySelectorAll<HTMLElement>("h2[id], h3[id]"),
      );
      return headings.length > 0;
    };

    const recompute = () => {
      rafPending = 0;
      if (headings.length === 0) return;
      // 좌표는 전부 스크롤 컨테이너(root) 상단 기준 — viewport 기준으로
      // 재면 root 가 화면 중간에서 시작하는 이 레이아웃에서 어긋난다.
      const rootTop = root.getBoundingClientRect().top;
      let pick: string | null = null;
      for (const h of headings) {
        if (h.getBoundingClientRect().top - rootTop < 32) pick = h.id;
      }
      // bottom 클램프 — 마지막 섹션이 짧으면 기준선을 영영 못 지나므로
      // 최하단 도달 시 마지막 heading.
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 8) {
        pick = headings[headings.length - 1]?.id ?? pick;
      }
      setActiveHeadingSlug(pick);
    };

    const scheduleRecompute = () => {
      if (rafPending) return;
      rafPending = requestAnimationFrame(recompute);
    };

    const onScroll = () => scheduleRecompute();
    root.addEventListener("scroll", onScroll, { passive: true });

    // 비동기 마크다운 도착 + React 의 DOM 노드 교체 양쪽을 커버 — heading
    // 세트가 비었거나 detach 됐으면 재수집 후 재계산.
    const domObserver = new MutationObserver(() => {
      if (headings.length === 0 || headings.some((h) => !h.isConnected)) {
        if (collectHeadings()) scheduleRecompute();
      }
    });
    const rafHandle = requestAnimationFrame(() => {
      if (collectHeadings()) scheduleRecompute();
      domObserver.observe(root, { childList: true, subtree: true });
    });

    return () => {
      cancelAnimationFrame(rafHandle);
      if (rafPending) cancelAnimationFrame(rafPending);
      root.removeEventListener("scroll", onScroll);
      domObserver.disconnect();
    };
  }, [selectedSlug, source]);

  return { articleScrollRef, activeHeadingSlug, setActiveHeadingSlug };
}
