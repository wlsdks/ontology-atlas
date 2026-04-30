"use client";

import { useEffect, useRef, useState } from "react";
import { scheduleStateSync } from "./persistence";

/**
 * DocsVaultPage 의 article 스크롤 컨테이너에서 현재 heading 추적 (Fire 4-d-1).
 *
 * IntersectionObserver 로 viewport 안 visible heading 을 추적하고, 그중 스크롤
 * 상단에 가장 가까운 heading 을 active 로 선택. 스크롤 위쪽에 visible heading
 * 이 없는 fallback 시 가장 최근에 지나간 heading 으로.
 *
 * 의존성:
 * - `selectedSlug` 가 바뀌면 active null 로 초기화 (새 문서)
 * - `source` ('server' | 'local') 가 바뀌면 article DOM 이 다시 그려지므로 재구독
 *
 * 반환:
 * - `articleScrollRef` — article 컨테이너 div ref (caller 가 부착)
 * - `activeHeadingSlug` — 현재 active heading 의 id (또는 null)
 * - `setActiveHeadingSlug` — 외부 click 으로 즉시 active 갱신 (스크롤 애니메
 *   이션 시작 시 IntersectionObserver 도착 전에 indicator 를 미리 옮길 때)
 *
 * 호출자: `AdminDocsContent` 의 우측 outline panel.
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
    let observer: IntersectionObserver | null = null;
    // 새 문서 렌더 후 DOM 이 채워지는 시점 잡기 위해 다음 frame 대기.
    const rafHandle = requestAnimationFrame(() => {
      const headings = root.querySelectorAll<HTMLElement>("h2[id], h3[id]");
      if (headings.length === 0) return;
      const visible = new Map<string, number>();
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const id = entry.target.id;
            if (entry.isIntersecting) {
              visible.set(id, entry.intersectionRatio);
            } else {
              visible.delete(id);
            }
          }
          // visible 맵에서 스크롤 상단에 가장 가까운 heading pick.
          let pick: string | null = null;
          let pickTop = Infinity;
          visible.forEach((_, id) => {
            const el = document.getElementById(id);
            if (!el) return;
            const top = el.getBoundingClientRect().top;
            if (top >= 0 && top < pickTop) {
              pickTop = top;
              pick = id;
            }
          });
          // fallback — 스크롤 위쪽에서 가장 최근에 지나간 heading
          if (!pick) {
            let lastPassed: string | null = null;
            headings.forEach((h) => {
              if (h.getBoundingClientRect().top < 32) lastPassed = h.id;
            });
            pick = lastPassed;
          }
          setActiveHeadingSlug(pick);
        },
        {
          root,
          rootMargin: "-24px 0px -65% 0px",
          threshold: [0, 0.25, 0.5, 0.75, 1],
        },
      );
      headings.forEach((h) => observer!.observe(h));
    });
    return () => {
      cancelAnimationFrame(rafHandle);
      observer?.disconnect();
    };
  }, [selectedSlug, source]);

  return { articleScrollRef, activeHeadingSlug, setActiveHeadingSlug };
}
