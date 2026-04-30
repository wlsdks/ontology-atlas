"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { WORKSPACE_PROJECT_QUERY_KEY } from "./account-scope";

/**
 * URL `?pj=<containerId>` 양방향 동기화. HomePage 의 `useHomeRouteState`
 * 가 통합 라우트 state 와 함께 다루는 것과 달리, 이 훅은 단일 query 만
 * 다룬다 — admin 같은 일반 페이지에서 selector 와 URL 만 묶을 때 재사용.
 *
 * 반환: `[currentProjectId, setProjectId]`. setter 에 null 전달 시 query
 * 제거. usePathname + useSearchParams + router.push 로 다른 query 보존.
 */
export function useWorkspaceProjectQuery(): [
  string | null,
  (next: string | null) => void,
] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get(WORKSPACE_PROJECT_QUERY_KEY);

  const setProjectId = useCallback(
    (next: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      const trimmed = next?.trim();
      if (trimmed) {
        params.set(WORKSPACE_PROJECT_QUERY_KEY, trimmed);
      } else {
        params.delete(WORKSPACE_PROJECT_QUERY_KEY);
      }
      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname);
    },
    [pathname, router, searchParams],
  );

  return [current, setProjectId];
}
