"use client";

import { useLayoutEffect } from "react";

/**
 * 클라이언트 사이드에서 `document.title` 을 동적으로 설정한다.
 *
 * Next.js App Router 의 metadata 시스템이 초기 commit 에서 `<title>` 을
 * layout default("Narnia") 로 재-쓰기하기 때문에, 단순 `useEffect` 로 set
 * 하면 그 뒤 metadata commit 이 덮어쓴다. 두 단계로 방어:
 *
 *  1. `useLayoutEffect` 로 paint 전에 한 번 덮어 쓰기.
 *  2. `<title>` 노드 textContent 변경을 MutationObserver 로 감시해, 다른
 *     쪽 (Next.js metadata) 이 재-쓰기 하면 즉시 원복. observer 는 unmount
 *     시 disconnect.
 *
 * `null`/빈 문자열이면 no-op (기본 타이틀 유지).
 */
export function useDocumentTitle(title: string | null | undefined): void {
  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    const trimmed = title?.trim();
    if (!trimmed) return;
    const previous = document.title;
    document.title = trimmed;
    const titleEl = document.querySelector("title");
    let observer: MutationObserver | null = null;
    if (titleEl) {
      observer = new MutationObserver(() => {
        if (document.title !== trimmed) {
          document.title = trimmed;
        }
      });
      observer.observe(titleEl, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
    return () => {
      observer?.disconnect();
      document.title = previous;
    };
  }, [title]);
}
