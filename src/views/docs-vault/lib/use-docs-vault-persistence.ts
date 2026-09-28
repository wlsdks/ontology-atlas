'use client';

import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  readPinnedDocs,
  readRecentDocs,
  togglePinnedDoc,
} from '@/widgets/docs-vault';
import type { VaultRecentKey } from '@/widgets/docs-vault';
import { scheduleStateSync } from './persistence';

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
   * The chosen source decides the namespace: a local source with no folder is not `server`,
   * or the sample's tabs stay on the local screen.
   */
  const recentKey = useMemo<VaultRecentKey>(() => {
    if (source === 'local') {
      return localVault.handle ? `local:${localVault.handle.name}` : 'local:';
    }
    return 'server';
  }, [source, localVault.handle]);

  const [recentSlugs, setRecentSlugsInternal] = useState<string[]>(() => readRecentDocs(recentKey));
  const [pinnedSlugs, setPinnedSlugsInternal] = useState<string[]>(() => readPinnedDocs(recentKey));
  const readKey = useRef(recentKey);

  const setRecentSlugs = useCallback<typeof setRecentSlugsInternal>(
    (next) => setRecentSlugsInternal(next),
    [],
  );
  const setPinnedSlugs = useCallback<typeof setPinnedSlugsInternal>(
    (next) => setPinnedSlugsInternal(next),
    [],
  );

  useEffect(() => {
    if (readKey.current === recentKey) return;
    readKey.current = recentKey;
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
