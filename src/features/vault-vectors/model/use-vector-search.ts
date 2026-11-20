'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { isTauriVaultRuntime } from '@/shared/lib/vault-folder/tauri-vault-fs';
import { vaultIndexPreference } from '@/shared/lib/vault-folder/tauri-vault-index';
import {
  searchVectors,
  warmVectors,
  type VectorFound,
  type VectorSource,
  type VectorStatus,
} from '@/shared/lib/vault-folder/tauri-vault-vectors';
import { vaultVectorSource, type VectorChoice } from '@/shared/lib/vault-folder/vault-vector-source';
import { deskLine } from './desk-line';
import { useVectorStatus } from './vector-store';

/** Passages one question asks for; the desk keeps those in the files it searches. */
export const VECTOR_SEARCH_LIMIT = 24;

const noSubscribe = () => () => undefined;

/**
 * The source a question asks by meaning through, or `null` when it asks by words alone: only in
 * the app, with the index on, for a folder with a stored choice whose vectors hold something
 * (ready, preparing, or stopped after at least one file).
 */
export function searchableSource(status: VectorStatus | null, choice: VectorChoice | null, isApp: boolean, indexOn: boolean): VectorSource | null {
  if (!isApp || !indexOn || choice === null || status === null) return null;
  if (status.phase === 'ready' || status.phase === 'preparing') return choice.source;
  if (status.phase === 'stopped' && status.filesDone > 0) return choice.source;
  return null;
}

export interface VectorSearch {
  /** Asks by meaning beside the word search; `null` when this folder asks by words alone. */
  ask: (question: string) => Promise<VectorFound> | null;
  /** Loads the model once per visit, on the field's first focus, for a folder that can ask. */
  warm: () => void;
  /** In the app with the index on and nothing set up, so a search that finds nothing offers setup. */
  offerSetup: boolean;
}

/** The Wiki desk's search by meaning for one folder; a visit ends when the desk is hidden. */
export function useVectorSearch(rootPath: string | null, markdownFiles: number, visible: boolean): VectorSearch {
  const isApp = useSyncExternalStore(noSubscribe, isTauriVaultRuntime, () => false);
  const indexOn = vaultIndexPreference.use() === 'on';
  const status = useVectorStatus(isApp ? rootPath : null);
  const choice = vaultVectorSource.use(rootPath);
  const source = rootPath === null ? null : searchableSource(status, choice, isApp, indexOn);
  const warmed = useRef<string | null>(null);

  useEffect(() => {
    if (!visible) warmed.current = null;
  }, [visible]);

  const ask = useCallback((question: string) => (
    rootPath !== null && source !== null ? searchVectors(rootPath, source, question, VECTOR_SEARCH_LIMIT) : null
  ), [rootPath, source]);

  const warm = useCallback(() => {
    if (rootPath === null || source === null || warmed.current === rootPath) return;
    warmed.current = rootPath;
    void warmVectors(source).catch(() => undefined);
  }, [rootPath, source]);

  const line = deskLine({ status, isApp, indexOn, markdownFiles, runnerModel: null });
  return { ask, warm, offerSetup: line?.message === 'words' };
}
