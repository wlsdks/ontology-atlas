'use client';

import { useEffect, useState } from 'react';
import { normalizeAccountId, resolveAccountId } from './account-scope';

/**
 * resolveAccountId 의 SSR-safe 래퍼.
 *
 * 문제 — `resolveAccountId` 는 sessionStorage / window.location 같은
 * client-only fallback 을 갖고 있어 SSR (=null) 과 CSR (=stress-lab) 의
 * 결과가 달라진다. SSR 결과를 그대로 first paint 에 넣으면 hydration
 * 직후 client 가 다른 값으로 다시 render 하면서 모든 link href 가
 * mismatch 한다.
 *
 * 해결 — 첫 paint / hydrate 는 항상 query value 만 사용해 SSR/CSR 동일,
 * mount 후 useEffect 에서 sessionStorage / runtime fallback 까지 포함해
 * 다시 resolve. 첫 frame 이 살짝 query 누락 상태일 수는 있지만
 * mismatch 가 사라지고 두 번째 commit 에서 정상 query 를 단다.
 */
export function useScopedAccountId(queryValue?: string | null): string | null {
  const [resolved, setResolved] = useState<string | null>(() =>
    normalizeAccountId(queryValue),
  );
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 의도된 mount-after-resolve. SSR/CSR hydration mismatch 해소를 위해 commit 후에만 client fallback 까지 반영.
    setResolved(resolveAccountId(queryValue));
  }, [queryValue]);
  return resolved;
}
