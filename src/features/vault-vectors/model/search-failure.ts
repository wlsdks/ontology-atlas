'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { subscribeVectorStatus, type VectorFailure, type VectorFound, type VectorStatus } from '@/shared/lib/vault-folder/tauri-vault-vectors';

/**
 * What the last search learned that the folder's status does not hold: Ollama did not answer, or
 * no longer has the model. The app leaves the status as it was, so the line says this failure until
 * a search answers or the app sends the folder's next status event.
 */
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

/** Whether the app keeps this failure in the folder's status, so the status is worth reading again. */
export function statusKeepsFailure(failure: VectorFailure | null): boolean {
  return failure === null || !HELD_FAILURES.has(failure);
}

/** Holds a runner failure the search answered, and lets it go once a search answers. */
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

/** The status the line reads: the folder's, with the last search's runner failure laid over it. */
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
