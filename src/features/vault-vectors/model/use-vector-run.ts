'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { VectorPhase, VectorStatus } from '@/shared/lib/vault-folder/tauri-vault-vectors';
import { vaultVectorSource } from '@/shared/lib/vault-folder/vault-vector-source';
import { deskLine, minutesLeftOf, UPDATE_RING_FILES, type DeskLine } from './desk-line';
import { pressOf, resume, statusOf, stop, subscribe } from './vector-store';

const RUN_PHASES: ReadonlySet<VectorPhase> = new Set([
  'waitingTurn', 'modelDownloading', 'modelConverting', 'preparing', 'stopped', 'ready', 'failed',
]);

export interface VectorRun {
  phase: VectorPhase;
  updating: boolean;
  quiet: boolean;
  fraction: number;
  filesDone: number;
  filesTotal: number;
  currentPath: string | null;
  minutesLeft: number | null;
  model: { doneBytes: number; totalBytes: number } | null;
  failure: Pick<DeskLine, 'message' | 'values'> | null;
  pressed: number | null;
  stop: () => void;
  resume: () => void;
}

function failureLine(rootPath: string, status: VectorStatus): VectorRun['failure'] {
  if (status.failure === null) return null;
  const source = vaultVectorSource.read(rootPath)?.source ?? null;
  const line = deskLine({
    status, isApp: true, indexOn: true, markdownFiles: status.filesTotal,
    runnerModel: source?.kind === 'runner' ? source.model : null,
  });
  return line ? { message: line.message, values: line.values } : null;
}

/** Never asks Rust: the folder bridge tells the stored choice once at open, and a running job's events reach the store by themselves. */
export function useVectorRun(rootPath: string | null): VectorRun | null {
  const readStatus = useCallback(() => (rootPath === null ? null : statusOf(rootPath)), [rootPath]);
  const status = useSyncExternalStore(subscribe, readStatus, () => null);
  const readPress = useCallback(() => (rootPath === null ? null : pressOf(rootPath)), [rootPath]);
  const pressed = useSyncExternalStore(subscribe, readPress, () => null);
  return useMemo(() => {
    if (rootPath === null || status === null || !RUN_PHASES.has(status.phase)) return null;
    // Converting follows a finished download, so the ring keeps it full.
    const bytes = status.phase === 'modelConverting'
      ? 1
      : status.phase === 'modelDownloading' && status.model !== null && status.model.totalBytes > 0
        ? status.model.doneBytes / status.model.totalBytes
        : null;
    const files = status.filesTotal > 0 ? status.filesDone / status.filesTotal : 0;
    return {
      phase: status.phase,
      updating: status.updating,
      quiet: status.phase === 'preparing' && status.updating && status.filesTotal < UPDATE_RING_FILES,
      fraction: Math.min(1, bytes ?? files),
      filesDone: status.filesDone,
      filesTotal: status.filesTotal,
      currentPath: status.currentPath,
      minutesLeft: status.phase === 'preparing' && !status.updating ? minutesLeftOf(status) : null,
      model: status.model,
      failure: failureLine(rootPath, status),
      pressed,
      stop: () => void stop(rootPath),
      resume: () => void resume(rootPath),
    };
  }, [rootPath, status, pressed]);
}
