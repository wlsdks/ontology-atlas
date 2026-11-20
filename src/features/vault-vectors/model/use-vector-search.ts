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
import { noteSearchAnswer, statusKeepsFailure } from './search-failure';
import { readStatusAgain, useVectorStatusOf } from './vector-store';

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

/**
 * A search that failed with what the app keeps in the folder's status (the model is gone) reads
 * that status again before the results show. A runner that did not answer is held for the line
 * instead, since the app leaves the status as it was. Either way line and notice agree.
 */
export async function askAndFollowFailure(rootPath: string, source: VectorSource, question: string, prefixes: readonly string[] = []): Promise<VectorFound> {
  const found = await searchVectors(rootPath, source, question, VECTOR_SEARCH_LIMIT, prefixes);
  noteSearchAnswer(rootPath, found);
  if (found.state === 'failed' && statusKeepsFailure(found.failure)) await readStatusAgain(rootPath);
  return found;
}

export interface VectorSearch {
  /** Asks by meaning beside the word search, within `prefixes`; `null` when this folder asks by words alone. */
  ask: (question: string, prefixes?: readonly string[]) => Promise<VectorFound> | null;
  /** Loads the model once per visit, on the field's first focus, for a folder that can ask. */
  warm: () => void;
  /** In the app with the index on and nothing set up, so a search that finds nothing offers setup. */
  offerSetup: boolean;
}

/**
 * The Wiki desk's search by meaning for one folder; a visit ends when the desk is hidden. The
 * folder's status is read as two yes-or-no values, so a progress event does not draw the desk.
 */
export function useVectorSearch(rootPath: string | null, markdownFiles: number, visible: boolean): VectorSearch {
  const isApp = useSyncExternalStore(noSubscribe, isTauriVaultRuntime, () => false);
  const indexOn = vaultIndexPreference.use() === 'on';
  const choice = vaultVectorSource.use(rootPath);
  const statusRoot = isApp ? rootPath : null;
  const searchable = useVectorStatusOf(statusRoot, (status) => searchableSource(status, choice, isApp, indexOn) !== null);
  const offerSetup = useVectorStatusOf(statusRoot, (status) => deskLine({ status, isApp, indexOn, markdownFiles, runnerModel: null })?.message === 'words');
  const source = rootPath !== null && searchable ? choice?.source ?? null : null;
  const warmed = useRef<string | null>(null);

  useEffect(() => {
    if (!visible) warmed.current = null;
  }, [visible]);

  const ask = useCallback((question: string, prefixes: readonly string[] = []) => (
    rootPath !== null && source !== null ? askAndFollowFailure(rootPath, source, question, prefixes) : null
  ), [rootPath, source]);

  const warm = useCallback(() => {
    if (rootPath === null || source === null || warmed.current === rootPath) return;
    warmed.current = rootPath;
    void warmVectors(source).catch(() => undefined);
  }, [rootPath, source]);

  return { ask, warm, offerSetup };
}
