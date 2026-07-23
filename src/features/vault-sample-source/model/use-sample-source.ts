'use client';

import { useCallback, useSyncExternalStore } from 'react';
import {
  getSampleSourceServerSnapshot,
  getSampleSourceSnapshot,
  subscribeSampleSource,
  writeSampleSourcePreference,
  type SampleSource,
} from '@/shared/lib/sample-source';

/**
 * static 모드(vault 미선택)에서 어떤 내장 샘플을 볼지 — "이 도구 살펴보기"
 * (dogfood) / "예시 비즈니스 보기"(storefront). `useOntologyInsight` 가 이
 * 값을 읽어 두 매니페스트 중 하나를 고른다. local 모드(vault 로드됨)에서는
 * 이 선택이 아예 소비되지 않는다 — 사용자 디스크가 항상 우선.
 *
 * 단일 모듈 스토어(useSyncExternalStore)를 구독해, 첫 실행 카드에서 바꾼
 * 값이 같은 스토어를 읽는 `useOntologyInsight` 인스턴스에도 즉시 전파된다
 * (독립 useState 였을 때는 리로드 전까지 지도가 안 바뀌던 결함 수정).
 * SSR/hydration 은 항상 'dogfood' 스냅샷이라 mismatch 없음.
 */
export function useSampleSource(): [SampleSource, (next: SampleSource) => void] {
  const source = useSyncExternalStore(
    subscribeSampleSource,
    getSampleSourceSnapshot,
    getSampleSourceServerSnapshot,
  );

  const setSource = useCallback((next: SampleSource) => {
    writeSampleSourcePreference(next);
  }, []);

  return [source, setSource];
}
