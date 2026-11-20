'use client';

import { useMemo } from 'react';
import type { VectorPhase } from '@/shared/lib/vault-folder/tauri-vault-vectors';
import { minutesLeftOf } from './desk-line';
import { resume, stop, useVectorStatus } from './vector-store';

const RUN_PHASES: ReadonlySet<VectorPhase> = new Set(['waitingTurn', 'modelDownloading', 'modelConverting', 'preparing', 'stopped']);

export interface VectorRun {
  phase: VectorPhase;
  /** Preparing only files that changed after `ready`; the rail draws no ring under ten of them. */
  updating: boolean;
  /** Bytes while the model downloads, files otherwise. */
  fraction: number;
  filesDone: number;
  filesTotal: number;
  currentPath: string | null;
  minutesLeft: number | null;
  model: { doneBytes: number; totalBytes: number } | null;
  stop: () => void;
  resume: () => void;
}

/** The long-work seat's view of the folder's job: `null` unless one is running or stopped. */
export function useVectorRun(rootPath: string | null): VectorRun | null {
  const status = useVectorStatus(rootPath);
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
      fraction: Math.min(1, bytes ?? files),
      filesDone: status.filesDone,
      filesTotal: status.filesTotal,
      currentPath: status.currentPath,
      minutesLeft: status.phase === 'preparing' && !status.updating ? minutesLeftOf(status) : null,
      model: status.model,
      stop: () => void stop(rootPath),
      resume: () => void resume(rootPath),
    };
  }, [rootPath, status]);
}
