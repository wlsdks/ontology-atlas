'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { subscribeVectorStatus, type VectorFailure, type VectorFound, type VectorStatus } from '@/shared/lib/vault-folder/tauri-vault-vectors';

/** The app leaves the status as it was after these failures, so the line says one until a search answers or the app sends the folder's next status event. */
const HELD_FAILURES: ReadonlySet<VectorFailure> = new Set(['runnerDown', 'modelMissing']);

const failures = new Map<string, VectorFailure>();
const listeners = new Set<() => void>();
let unsubscribeEvents: (() => void) | null = null;

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  unsubscribeEvents ??= subscribeVectorStatus(({ rootPath }) => {
    if (failures.delete(rootPath)) notify();
  });
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function statusKeepsFailure(failure: VectorFailure | null): boolean {
  return failure === null || !HELD_FAILURES.has(failure);
}

export function noteSearchAnswer(rootPath: string, found: VectorFound): void {
  const before = failures.get(rootPath) ?? null;
  if (found.state === 'failed' && !statusKeepsFailure(found.failure)) failures.set(rootPath, found.failure!);
  else if (found.state === 'ok') failures.delete(rootPath);
  if ((failures.get(rootPath) ?? null) !== before) notify();
}

export function useSearchFailure(rootPath: string | null): VectorFailure | null {
  const getSnapshot = useCallback(() => (rootPath === null ? null : failures.get(rootPath) ?? null), [rootPath]);
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

export function withSearchFailure(status: VectorStatus | null, failure: VectorFailure | null): VectorStatus | null {
  if (status === null || failure === null) return status;
  return {
    ...status,
    phase: status.filesDone > 0 ? 'stopped' : 'failed',
    failure,
    failureDetail: null,
    updating: false,
    currentPath: null,
    passagesPerSecond: null,
  };
}
