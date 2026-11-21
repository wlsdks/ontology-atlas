import type { VectorSource, VectorStatus } from '@/shared/lib/vault-folder/tauri-vault-vectors';
import { UPDATE_RING_FILES } from '../desk-line';

/** The work a preparation does, in order; a runner's model is Ollama's, so only `read` is Atlas's. */
export type RunStep = 'download' | 'fit' | 'read';

export type StepState = 'done' | 'now' | 'next';

export interface RunStage {
  steps: { step: RunStep; state: StepState }[];
  /** The step the bar measures; `null` while waiting for another folder's job. */
  step: RunStep | null;
  /** How far the current step is, or `null` when nothing can be counted yet. */
  fraction: number | null;
  /** The file being read, vault-relative. */
  readingPath: string | null;
  passagesDone: number;
}

const ORDER: readonly RunStep[] = ['download', 'fit', 'read'];

/**
 * Each step's state with `current` running: those before it done, those after it next. `null` is
 * before the first step, `finished` past the last. A runner's model shows the reading alone.
 */
export function runSteps(current: RunStep | 'finished' | null, source: VectorSource | null = null): RunStage['steps'] {
  const shown = source?.kind === 'runner' ? (['read'] as const) : ORDER;
  const at = current === null ? -1 : current === 'finished' ? ORDER.length : ORDER.indexOf(current);
  return shown.map((step) => {
    const index = ORDER.indexOf(step);
    return { step, state: index < at ? 'done' : index === at ? 'now' : 'next' };
  });
}

const ratio = (done: number, total: number) => (total > 0 ? Math.min(1, Math.max(0, done / total)) : null);

/**
 * What the desk's stage draws while the folder's job runs, or `null` when nothing runs that the
 * stage tells: an update of a few changed files stays one quiet sentence.
 */
export function runStage(status: VectorStatus | null, source: VectorSource | null): RunStage | null {
  if (status === null) return null;
  const base = { readingPath: null, passagesDone: status.passagesDone };
  switch (status.phase) {
    case 'waitingTurn':
      return { ...base, steps: runSteps(null, source), step: null, fraction: null };
    case 'modelDownloading':
      return { ...base, steps: runSteps('download', source), step: 'download', fraction: ratio(status.model?.doneBytes ?? 0, status.model?.totalBytes ?? 0) };
    case 'modelConverting':
      return { ...base, steps: runSteps('fit', source), step: 'fit', fraction: null };
    case 'preparing':
      if (status.updating && status.filesTotal < UPDATE_RING_FILES) return null;
      return {
        steps: runSteps('read', source),
        step: 'read',
        fraction: ratio(status.filesDone, status.filesTotal) ?? 0,
        readingPath: status.currentPath,
        passagesDone: status.passagesDone,
      };
    default:
      return null;
  }
}

/** The stage a finished job leaves in view: every step done. */
export function finishedStage(source: VectorSource | null): RunStage {
  return { steps: runSteps('finished', source), step: 'read', fraction: 1, readingPath: null, passagesDone: 0 };
}
