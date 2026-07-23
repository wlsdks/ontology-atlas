'use client';

import { useCallback, useState } from 'react';
import {
  readSampleSourcePreference,
  writeSampleSourcePreference,
  type SampleSource,
} from '@/shared/lib/sample-source';

/**
 * static 모드(vault 미선택)에서 어떤 내장 샘플을 볼지 — "이 도구 살펴보기"
 * (dogfood) / "예시 비즈니스 보기"(storefront). `useOntologyInsight` 가 이
 * 값을 읽어 두 매니페스트 중 하나를 고른다. local 모드(vault 로드됨)에서는
 * 이 선택이 아예 소비되지 않는다 — 사용자 디스크가 항상 우선.
 *
 * lazy initializer 는 클라이언트에서만 실제 실행(SSR 은 항상 'dogfood'),
 * hydration 도 localStorage 없는 서버 프리렌더 기준과 같아 mismatch 없음
 * (HomePage 의 `audiencePlain` 토글과 동일한 패턴).
 */
export function useSampleSource(): [SampleSource, (next: SampleSource) => void] {
  const [source, setSourceState] = useState<SampleSource>(readSampleSourcePreference);

  const setSource = useCallback((next: SampleSource) => {
    writeSampleSourcePreference(next);
    setSourceState(next);
  }, []);

  return [source, setSource];
}
