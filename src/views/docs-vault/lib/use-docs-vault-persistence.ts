'use client';

import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  pushRecentDoc as _pushRecentDoc,
  readPinnedDocs,
  readRecentDocs,
  togglePinnedDoc,
} from '@/widgets/docs-vault';
import type { VaultRecentKey } from '@/widgets/docs-vault';
import { scheduleStateSync } from './persistence';

/**
 * R11 #16 step 5 — DocsVaultPage 의 pinned/recent docs persistence 흐름 추출.
 *
 * 캡슐화:
 * - recentKey useMemo (현재 볼트의 namespace — local 폴더 이름 또는 'server')
 * - recentSlugs / pinnedSlugs state
 * - rehydrate useEffect (recentKey 변경 시 localStorage → state)
 * - togglePin useCallback (pinned toggle 후 자동 persist)
 * - pinnedSet derived (Set 변환 cache)
 *
 * setter 들 (setRecentSlugs / setPinnedSlugs) 도 외부 노출 — view 의 다양한
 * mutation 사이트 (delete / new doc / 등) 가 직접 호출. 완전한 encapsulation
 * 은 후속 step 에서 (mutation 들도 hook method 로 흡수).
 */

interface LocalVaultLike {
  handle: FileSystemDirectoryHandle | null;
}

interface UseDocsVaultPersistenceArgs {
  source: 'server' | 'local';
  localVault: LocalVaultLike;
}

interface UseDocsVaultPersistenceResult {
  recentKey: VaultRecentKey;
  recentSlugs: string[];
  setRecentSlugs: Dispatch<SetStateAction<string[]>>;
  pinnedSlugs: string[];
  setPinnedSlugs: Dispatch<SetStateAction<string[]>>;
  pinnedSet: Set<string>;
  togglePin: (slug: string) => void;
}

export function useDocsVaultPersistence({
  source,
  localVault,
}: UseDocsVaultPersistenceArgs): UseDocsVaultPersistenceResult {
  /**
   * 이 볼트의 저장소 namespace.
   *
   * **폴더를 아직 안 고른 로컬도 `server` 가 아니다** (2026-07-28 소유자 실사용
   * 제보). 종전에는 `source === 'local'` 이어도 handle 이 없으면 `'server'` 로
   * 떨어졌다. 그래서 샘플에서 문서를 열어 둔 채 로컬로 전환하면 — 폴더를 고르기
   * 전 상태 — **샘플의 열린 탭이 로컬 화면에 그대로 남았다**. 사용자는 소스를
   * 바꿨는데 이전 소스의 문서가 상단에 붙어 있는 것을 본다.
   *
   * 사용자가 고른 소스가 namespace 를 정한다. 폴더 미선택은 "샘플" 이 아니라
   * **"아직 폴더가 없는 로컬"** 이라는 별개 상태다.
   */
  const recentKey = useMemo<VaultRecentKey>(() => {
    if (source === 'local') {
      return localVault.handle ? `local:${localVault.handle.name}` : 'local:';
    }
    return 'server';
  }, [source, localVault.handle]);

  const [recentSlugs, setRecentSlugsInternal] = useState<string[]>([]);
  const [pinnedSlugs, setPinnedSlugsInternal] = useState<string[]>([]);

  // ESLint 의 react-hooks/exhaustive-deps 가 destructured setter 의 stability
  // 추적 못 함 — useCallback wrap 으로 ref-stable 명시. setState setter 는
  // 본래 stable 이라 기능 영향 0 (useAdvancedMenu 와 동일 패턴).
  const setRecentSlugs = useCallback<typeof setRecentSlugsInternal>(
    (next) => setRecentSlugsInternal(next),
    [],
  );
  const setPinnedSlugs = useCallback<typeof setPinnedSlugsInternal>(
    (next) => setPinnedSlugsInternal(next),
    [],
  );

  // recentKey 가 바뀔 때마다 해당 볼트의 recent + pinned 목록 로드.
  useEffect(() => {
    scheduleStateSync(() => {
      setRecentSlugsInternal(readRecentDocs(recentKey));
      setPinnedSlugsInternal(readPinnedDocs(recentKey));
    });
  }, [recentKey]);

  const togglePin = useCallback(
    (slug: string) => {
      setPinnedSlugsInternal(togglePinnedDoc(recentKey, slug));
    },
    [recentKey],
  );

  const pinnedSet = useMemo(() => new Set(pinnedSlugs), [pinnedSlugs]);

  return {
    recentKey,
    recentSlugs,
    setRecentSlugs,
    pinnedSlugs,
    setPinnedSlugs,
    pinnedSet,
    togglePin,
  };
}

// pushRecentDoc 은 module-level helper — view 가 직접 호출 가능.
export const pushRecentDoc = _pushRecentDoc;
