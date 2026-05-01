'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDataSourceMode } from '@/features/data-source-mode';
import { useLocalVault } from '@/features/docs-vault-local';
import {
  deriveProjectsFromVault,
  vaultManifest as staticVaultManifestRaw,
  type VaultManifest,
} from '@/entities/docs-vault';

// JSON import 가 mode 같은 union 필드를 string 으로 추론. 빌드 시점에 schema
// 가 안정적이라 runtime 검증 대신 cast.
const staticVaultManifest = staticVaultManifestRaw as VaultManifest;
import { subscribeProjects, type Project } from '@/entities/project';

/**
 * mode-aware read 어댑터.
 *
 * - **local**: vault manifest 의 `projects/*.md` frontmatter 를 동기 매핑.
 *   사용자가 vault 에 .md 추가하면 즉시 list 에 반영. Firebase 의존 없음.
 * - **cloud**: 기존 `subscribeProjects` (Firestore onSnapshot) — 실시간 sync.
 * - **static**: 빌드 타임 docs/ontology/ 매니페스트 = dogfood 진실원.
 *   사용자가 vault 안 골랐고 인증 안 돼있어도 oh-my-ontology 자체 ontology
 *   가 즉시 보인다. 이게 mission v2 의 "0 마찰 진입" 약속의 read 측 구현 —
 *   builder/topology 가 빈 화면 대신 진짜 ontology 를 그린다.
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

  // static 모드 — 빌드타임 dogfood 매니페스트. Firebase / vault 픽 없이도
  // oh-my-ontology 자체 ontology 가 즉시 보인다. JSON import 라 동기 derive.
  const staticProjects = useMemo(() => {
    if (mode !== 'static') return [];
    return deriveProjectsFromVault(staticVaultManifest);
  }, [mode]);

  // cloud — Firestore 구독.
  useEffect(() => {
    if (mode !== 'cloud') return;
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
  if (mode === 'static') {
    return {
      projects: staticProjects,
      loaded: true,
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
