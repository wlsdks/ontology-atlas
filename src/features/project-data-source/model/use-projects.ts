'use client';

import { useMemo } from 'react';
import { useDataSourceMode } from '@/features/data-source-mode';
import { useLocalVault } from '@/features/docs-vault-local';
import { useStaticVaultSource } from '@/features/vault-sample-source';
import { deriveProjectsFromVault } from '@/entities/docs-vault';
import type { Project } from '@/entities/project';

/**
 * mode-aware read 어댑터. 2 모드:
 *
 * - **local**: vault manifest 의 `projects/*.md` frontmatter 를 동기 매핑.
 *   사용자가 vault 에 .md 추가하면 즉시 list 에 반영.
 * - **static**: 빌드 타임 번들 매니페스트. vault 미선택 사용자도 ontology 를
 *   즉시 본다 — "0 마찰 진입" 의 read 구현. 어느 번들 볼트인지는 사용자의
 *   "예시 비즈니스" 선택이 정하므로 매니페스트를 직접 import 하지 않는다.
 */
export interface UseProjectsState {
  projects: Project[];
  loaded: boolean;
  error: string | null;
  mode: 'static' | 'local';
}

export function useProjects(): UseProjectsState {
  const mode = useDataSourceMode();
  const vault = useLocalVault();
  // 번들 볼트는 모듈 상수 두 벌 중 하나를 그대로 돌려주므로 참조가 안정적이다
  // — 의존성 배열에 넣어도 리렌더마다 재계산되지 않는다.
  const staticSource = useStaticVaultSource();

  const localProjects = useMemo(() => {
    if (mode !== 'local' || !vault.manifest) return [];
    return deriveProjectsFromVault(vault.manifest);
  }, [mode, vault.manifest]);

  const staticProjects = useMemo(() => {
    if (mode !== 'static') return [];
    return deriveProjectsFromVault(staticSource.manifest);
  }, [mode, staticSource.manifest]);

  if (mode === 'local') {
    return {
      projects: localProjects,
      loaded: vault.status === 'loaded',
      error: null,
      mode,
    };
  }
  return {
    projects: staticProjects,
    loaded: true,
    error: null,
    mode,
  };
}
