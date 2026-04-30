"use client";

import { useEffect, useRef } from "react";

/**
 * 직전 렌더에서 받은 값을 돌려준다. React 의 ref + effect 패턴으로 매 렌더
 * 후에 갱신되므로, 같은 렌더 사이클 안에서는 "직전 값" 으로 보인다.
 *
 * 용도: URL ↔ local state 동기화처럼 "URL 이 바뀌었을 때만" 한쪽으로
 * 흐르는 효과를 작성할 때 dep array 우회를 명시적으로 풀어 준다.
 *
 * NOTE: render 중 ref.current 를 읽는 건 react-hooks/refs 가 경고하는
 * 패턴이지만, usePrevious 의 본질상 의도적이다. 직전 commit 의 ref 값을
 * 반환하면서 effect 로 다음 commit 의 값을 갱신한다 — React 공식 docs 의
 * usePrevious 예제와 동일한 패턴.
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  });
  // eslint-disable-next-line react-hooks/refs
  return ref.current;
}
