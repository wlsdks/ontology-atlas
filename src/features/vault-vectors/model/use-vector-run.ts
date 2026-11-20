'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type RefCallback } from 'react';
import type { VectorPhase, VectorStatus } from '@/shared/lib/vault-folder/tauri-vault-vectors';
import { vaultVectorSource } from '@/shared/lib/vault-folder/vault-vector-source';
import { deskLine, minutesLeftOf, UPDATE_RING_FILES, type DeskLine } from './desk-line';
import { pressOf, resume, stop, subscribe, useVectorStatus } from './vector-store';

const RUN_PHASES: ReadonlySet<VectorPhase> = new Set([
  'waitingTurn', 'modelDownloading', 'modelConverting', 'preparing', 'stopped', 'ready', 'failed',
]);

export interface VectorRun {
  phase: VectorPhase;
  /** Preparing only files that changed after `ready`; the rail draws no ring under ten of them. */
  updating: boolean;
  /** An update of fewer than ten changed files: nothing outside the desk draws it. */
  quiet: boolean;
  /** Bytes while the model downloads, files otherwise. */
  fraction: number;
  filesDone: number;
  filesTotal: number;
  currentPath: string | null;
  minutesLeft: number | null;
  model: { doneBytes: number; totalBytes: number } | null;
  /** The desk line's sentence for a failure, under `library.questionDesk.meaning`. */
  failure: Pick<DeskLine, 'message' | 'values'> | null;
  /** The press that started or resumed the job in this launch; `null` when it continues by itself. */
  pressed: number | null;
  stop: () => void;
  resume: () => void;
}

/** What the seat says of a failure is what the desk line says of it. */
function failureLine(rootPath: string, status: VectorStatus): VectorRun['failure'] {
  if (status.failure === null) return null;
  const source = vaultVectorSource.read(rootPath)?.source ?? null;
  const line = deskLine({
    status, isApp: true, indexOn: true, markdownFiles: status.filesTotal,
    runnerModel: source?.kind === 'runner' ? source.model : null,
  });
  return line ? { message: line.message, values: line.values } : null;
}

/** The long-work seat's view of the folder's job: `null` until the folder has one to tell. */
export function useVectorRun(rootPath: string | null): VectorRun | null {
  const status = useVectorStatus(rootPath);
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

/** Folders whose Wiki desk shows the meaning line now, with how many lines show each. */
const stages = new Map<string, number>();
const stageListeners = new Set<() => void>();

function subscribeStages(listener: () => void): () => void {
  stageListeners.add(listener);
  return () => {
    stageListeners.delete(listener);
  };
}

function moveStage(rootPath: string, by: 1 | -1): void {
  const count = (stages.get(rootPath) ?? 0) + by;
  if (count > 0) stages.set(rootPath, count);
  else stages.delete(rootPath);
  for (const listener of stageListeners) listener();
}

/**
 * Registers the desk's meaning line as the job's stage while it is drawn: the seat stands down
 * there, so the progress is never said twice. A line inside a hidden desk has no box and is not
 * a stage.
 */
export function useVectorRunStage(rootPath: string | null): RefCallback<HTMLElement> {
  const [element, setElement] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (rootPath === null || element === null || typeof ResizeObserver === 'undefined') return undefined;
    let shown = false;
    const show = (next: boolean) => {
      if (next === shown) return;
      shown = next;
      moveStage(rootPath, next ? 1 : -1);
    };
    // Measured at once as well, so a line that replaces another never leaves the stage for a frame.
    show(element.getBoundingClientRect().width > 0);
    const observer = new ResizeObserver(([entry]) => show(entry.contentRect.width > 0));
    observer.observe(element);
    return () => {
      observer.disconnect();
      show(false);
    };
  }, [rootPath, element]);
  return setElement;
}

/** Whether the folder's desk line stands on screen now. */
export function useVectorRunStageShown(rootPath: string | null): boolean {
  const read = useCallback(() => rootPath !== null && stages.has(rootPath), [rootPath]);
  return useSyncExternalStore(subscribeStages, read, () => false);
}
