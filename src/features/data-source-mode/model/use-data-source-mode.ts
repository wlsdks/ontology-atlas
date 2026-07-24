'use client';

import { useEffect, useMemo } from 'react';
import { useLocalVault } from '@/features/docs-vault-local';
import {
  getDataSourceMode,
  publishDataSourceModeForDebug,
  type DataSourceMode,
} from '@/shared/lib/data-source-mode';

/**
 * 현재 운영 모드 (`'static' | 'local'`) 를 React 상태로 노출.
 *
 * - **local**: vault 선택됨, 사용자 디스크가 진실원
 * - **static**: vault 미선택, 빌드타임 dogfood 매니페스트
 *
 * 부수 효과: `window.__ohMyOntologyMode` 에 현재 mode 발행 (디버그 전용).
 */
export function useDataSourceMode(): DataSourceMode {
  const { status: vaultStatus, manifest } = useLocalVault();

  const mode = useMemo<DataSourceMode>(
    () =>
      getDataSourceMode({
        // write/poll 뒤 증분 rebuild는 마지막으로 검증된 manifest를 보존한다.
        // 이 짧은 loading 동안 static dogfood로 source를 바꾸면 local slug
        // 상세·편집이 not-found로 굳는다. 첫 로드(manifest 없음)만 static.
        vaultLoaded: vaultStatus === 'loaded' || Boolean(manifest),
      }),
    [manifest, vaultStatus],
  );

  useEffect(() => {
    publishDataSourceModeForDebug(mode);
  }, [mode]);

  return mode;
}
