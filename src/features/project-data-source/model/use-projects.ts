'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDataSourceMode } from '@/features/data-source-mode';
import { useLocalVault } from '@/features/docs-vault-local';
import { deriveProjectsFromVault } from '@/entities/docs-vault';
import { subscribeProjects, type Project } from '@/entities/project';

/**
 * mode-aware read 어댑터.
 *
 * - **local**: vault manifest 의 `projects/*.md` frontmatter 를 동기 매핑.
 *   사용자가 vault 에 .md 추가하면 즉시 list 에 반영. Firebase 의존 없음.
 * - **cloud**: 기존 `subscribeProjects` (Firestore onSnapshot) — 실시간 sync.
 * - **static**: vault 디스크가 없는 빈 데모 진입 — 현재는 cloud 로 흘려보냄
 *   (legacy 데모 호환). 추후 정적 manifest 로 분리 가능.
 *
 * mission T7 — local 모드 사용자가 vault 에 추가한 프로젝트가 /projects ·
 * 토폴로지에서 안 보이던 read inconsistency 해결. mutation 측 (`useProjectMutations`)
 * 이 이미 mode-aware 라 read 도 같이 모드 정렬.
 */
export interface UseProjectsState {
  projects: Project[];
  loaded: boolean;
  error: string | null;
  mode: 'static' | 'local' | 'cloud';
}

export function useProjects(accountId?: string | null): UseProjectsState {
  const mode = useDataSourceMode();
  const vault = useLocalVault();
  const [cloudProjects, setCloudProjects] = useState<Project[]>([]);
  const [cloudLoaded, setCloudLoaded] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);

  // local 모드 — manifest 가 sync 라 useEffect 없이 useMemo 로 즉시 derive.
  const localProjects = useMemo(() => {
    if (mode !== 'local' || !vault.manifest) return [];
    return deriveProjectsFromVault(vault.manifest);
  }, [mode, vault.manifest]);

  // cloud (또는 static legacy 호환) — Firestore 구독.
  useEffect(() => {
    if (mode === 'local') return;
    setCloudError(null);
    const unsubscribe = subscribeProjects(
      accountId ?? null,
      (next) => {
        setCloudProjects(next);
        setCloudLoaded(true);
      },
      (error) => {
        setCloudError(error.message?.trim() || '프로젝트를 불러오지 못했습니다.');
        setCloudLoaded(true);
      },
    );
    return () => unsubscribe();
  }, [mode, accountId]);

  if (mode === 'local') {
    return {
      projects: localProjects,
      loaded: vault.status === 'loaded',
      error: null,
      mode,
    };
  }
  return {
    projects: cloudProjects,
    loaded: cloudLoaded,
    error: cloudError,
    mode,
  };
}
