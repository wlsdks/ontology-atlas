import type { VectorFailure, VectorStatus } from '@/shared/lib/vault-folder/tauri-vault-vectors';

/** Keys under `library.questionDesk.meaning` that the line under the question field can say. */
export type DeskLineMessage =
  | 'web'
  | 'words'
  | 'noFiles'
  | 'indexOff'
  | 'waitingTurn'
  | 'modelDownloading'
  | 'modelConverting'
  | 'preparing'
  | 'stopped'
  | 'ready'
  | 'updating'
  | 'modelDownloadFailed'
  | 'modelCheckFailed'
  | 'modelNeedsDirect'
  | 'modelGone'
  | 'modelFailed'
  | 'runnerDown'
  | 'modelMissing'
  | 'writeFailed'
  | 'auditBlocked'
  | 'unreadable';

export type DeskLineAction = 'setup' | 'stop' | 'resume' | 'downloadAgain' | 'openSettings';

/** What the ring draws: bytes while the model downloads, files while preparing. */
export interface DeskProgress {
  measure: 'bytes' | 'files';
  done: number;
  total: number;
  fraction: number;
}

export interface DeskLine {
  message: DeskLineMessage;
  /** The message's own values; `done`/`total` of a working line come from `progress`. */
  values: { count?: number; done?: number; total?: number; detail?: string; model?: string };
  /** `hold`: the ring keeps the value it last drew while the model is converted. */
  progress: DeskProgress | 'hold' | null;
  minutesLeft: number | null;
  readingPath: string | null;
  action: DeskLineAction | null;
  tone: 'quiet' | 'warning' | 'danger';
}

export interface DeskLineInput {
  /** `null` until the app's first answer. */
  status: VectorStatus | null;
  isApp: boolean;
  indexOn: boolean;
  markdownFiles: number;
  /** The runner model the folder's stored source names, for `modelMissing`. */
  runnerModel: string | null;
}

const SECONDS_PER_MINUTE = 60;
/** An update of this many changed files or more is followed like a first preparation. */
export const UPDATE_RING_FILES = 10;

const line = (message: DeskLineMessage, fields: Partial<DeskLine> = {}): DeskLine => ({
  message,
  values: {},
  progress: null,
  minutesLeft: null,
  readingPath: null,
  action: null,
  tone: 'quiet',
  ...fields,
});

function progressOf(measure: DeskProgress['measure'], done: number, total: number): DeskProgress {
  const fraction = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0;
  return { measure, done: Math.min(done, total), total, fraction };
}

/** Rounded up and only once Rust measured a rate; never a guess before that. */
export function minutesLeftOf(status: VectorStatus): number | null {
  const rate = status.passagesPerSecond;
  if (rate === null || rate <= 0) return null;
  const remaining = Math.max(0, status.passagesTotal - status.passagesDone);
  return Math.ceil(remaining / rate / SECONDS_PER_MINUTE);
}

const FAILURE_LINES: Record<VectorFailure, (status: VectorStatus, input: DeskLineInput) => DeskLine> = {
  download: (status) => line('modelDownloadFailed', { values: { detail: status.failureDetail ?? '' }, action: 'resume', tone: 'warning' }),
  // The dialog, reopened through Set up, states what is needed and what is free.
  diskShort: (status) => line('modelDownloadFailed', { values: { detail: status.failureDetail ?? '' }, action: 'setup', tone: 'danger' }),
  modelCheck: () => line('modelCheckFailed', { action: 'downloadAgain', tone: 'danger' }),
  needsDirect: () => line('modelNeedsDirect', { action: 'resume', tone: 'warning' }),
  modelGone: () => line('modelGone', { action: 'downloadAgain', tone: 'warning' }),
  modelFailed: (status) => line('modelFailed', { values: { detail: status.failureDetail ?? '' }, action: 'resume', tone: 'warning' }),
  runnerDown: () => line('runnerDown', { action: 'resume', tone: 'warning' }),
  modelMissing: (_status, input) => line('modelMissing', { values: { model: input.runnerModel ?? '' }, action: 'resume', tone: 'warning' }),
  write: (status) => line('writeFailed', { values: { detail: status.failureDetail ?? '' }, action: 'resume', tone: 'danger' }),
  auditBlocked: () => line('auditBlocked', { action: 'resume', tone: 'danger' }),
  unreadable: () => line('unreadable', { action: 'resume', tone: 'danger' }),
};

/** The one line under the Wiki desk's question field, from the spec's States table. */
export function deskLine(input: DeskLineInput): DeskLine | null {
  const { status, isApp, indexOn, markdownFiles } = input;
  if (!isApp) return line('web');
  if (!indexOn || status?.phase === 'off') return line('indexOff', { action: 'openSettings' });
  if (status === null) return null;
  if (status.failure !== null && (status.phase === 'failed' || status.phase === 'stopped')) {
    return FAILURE_LINES[status.failure](status, input);
  }
  switch (status.phase) {
    case 'notSetUp':
    case 'failed':
      return markdownFiles === 0 ? line('noFiles') : line('words', { action: 'setup' });
    case 'waitingTurn':
      return line('waitingTurn', { action: 'stop' });
    case 'modelDownloading':
      return line('modelDownloading', {
        progress: progressOf('bytes', status.model?.doneBytes ?? 0, status.model?.totalBytes ?? 0),
        action: 'stop',
      });
    case 'modelConverting':
      return line('modelConverting', { progress: 'hold', action: 'stop' });
    case 'preparing': {
      if (status.updating) {
        const count = Math.max(0, status.filesTotal - status.filesDone);
        if (count === 0) return line('ready');
        if (status.filesTotal < UPDATE_RING_FILES) return line('updating', { values: { count } });
        return line('updating', {
          values: { count },
          progress: progressOf('files', status.filesDone, status.filesTotal),
          minutesLeft: minutesLeftOf(status),
          readingPath: status.currentPath,
          action: 'stop',
        });
      }
      return line('preparing', {
        progress: progressOf('files', status.filesDone, status.filesTotal),
        minutesLeft: minutesLeftOf(status),
        readingPath: status.currentPath,
        action: 'stop',
      });
    }
    case 'stopped':
      return line('stopped', { values: { done: status.filesDone, total: status.filesTotal }, action: 'resume' });
    case 'ready':
      return line('ready');
  }
}
