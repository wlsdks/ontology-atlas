import { useEffect, useRef, type MutableRefObject } from 'react';

/**
 * 매 렌더마다 새 함수 참조로 넘어오는 prop callback 을 안정된 ref 로 동기화.
 *
 * 용도: 비싸게 생성된 리소스(Sigma renderer, d3-force 시뮬레이션 등)를 만드는
 * useEffect 가 prop callback 변경 때문에 재실행되는 걸 막는 패턴. deps 배열에
 * 원본 콜백을 넣는 대신 ref 만 캡처해서 인스턴스가 유지된다.
 *
 * 사용:
 *   const onSelectRef = useSyncedCallbackRef(onSelect);
 *   useEffect(() => {
 *     renderer.on('click', (node) => onSelectRef.current?.(node));
 *   }, [renderer]); // onSelect 는 deps 에서 빠져도 된다
 */
export function useSyncedCallbackRef<T>(
  callback: T | undefined,
): MutableRefObject<T | undefined> {
  const ref = useRef<T | undefined>(callback);
  useEffect(() => {
    ref.current = callback;
  }, [callback]);
  return ref;
}
