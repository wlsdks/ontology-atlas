import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { vaultIndexPreference } from './tauri-vault-index';

/**
 * The installed app's search by meaning (`src-tauri/src/vault/vectors.rs`): a vector for each
 * passage of the folder's Markdown files, kept beside the search index in the OS cache folder and
 * prepared by a model on this computer. Code names it by what it stores, vectors; "meaning" in code
 * already names accepted product meaning. The web has none: every call here answers the `off`
 * status or an empty result and never throws.
 */

/** The person's choice for a folder; the WebView keeps it and sends it with every command. */
export type VectorSource = { kind: 'builtin' } | { kind: 'runner'; baseUrl: string; model: string };

export type VectorPhase =
  | 'off'
  | 'notSetUp'
  | 'waitingTurn'
  | 'modelDownloading'
  | 'modelConverting'
  | 'preparing'
  | 'stopped'
  | 'ready'
  | 'failed';

/** `modelFailed`: the model could not start, stopped answering, or answered with vectors Atlas refused. */
export type VectorFailure =
  | 'download'
  | 'modelCheck'
  | 'needsDirect'
  | 'diskShort'
  | 'modelGone'
  | 'runnerDown'
  | 'modelMissing'
  | 'modelFailed'
  | 'write'
  | 'auditBlocked'
  | 'unreadable';

/** Counts are folder-wide: `ready` means `filesDone === filesTotal`. */
export interface VectorStatus {
  phase: VectorPhase;
  /** Set with `failed`, and with `stopped` after a failure. */
  failure: VectorFailure | null;
  /** A coded reason, never vault text. */
  failureDetail: string | null;
  filesDone: number;
  filesTotal: number;
  passagesDone: number;
  passagesTotal: number;
  /** Preparing only files that changed after `ready`. */
  updating: boolean;
  /** Vault-relative, the file being read. */
  currentPath: string | null;
  /** Over at least the last 30 s; `null` until measured. */
  passagesPerSecond: number | null;
  /** While `modelDownloading`. */
  model: { doneBytes: number; totalBytes: number } | null;
  vectorsBytes: number;
}

export interface VectorProbe {
  files: number;
  builtin: {
    onDisk: boolean;
    downloadBytes: number;
    keptBytes: number;
    neededFreeBytes: number;
    freeBytes: number;
    memoryBytes: number;
    accelerated: boolean;
  };
  runner: { state: 'reachable' | 'unreachable' | 'notLocal'; address: string; models: string[] } | null;
}

export interface PassageHit {
  /** Vault-relative, `/`-separated. */
  path: string;
  /** 1-based, inclusive, in the file as it is now. */
  lineStart: number;
  lineEnd: number;
  heading: string;
  /** Higher is nearer. */
  score: number;
}

export interface VectorFound {
  state: 'ok' | 'notReady' | 'failed';
  failure: VectorFailure | null;
  hits: PassageHit[];
  staleDropped: number;
  filesReady: number;
  filesTotal: number;
}

export interface VectorStatusEvent {
  rootPath: string;
  status: VectorStatus;
}

/** A search returns at most this many passages. */
export const MAX_VECTOR_HITS = 64;

const STATUS_EVENT = 'vault-vectors-status';

export const OFF_VECTOR_STATUS: Readonly<VectorStatus> = Object.freeze({
  phase: 'off',
  failure: null,
  failureDetail: null,
  filesDone: 0,
  filesTotal: 0,
  passagesDone: 0,
  passagesTotal: 0,
  updating: false,
  currentPath: null,
  passagesPerSecond: null,
  model: null,
  vectorsBytes: 0,
});

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function getInvoke(): Invoke | null {
  if (typeof window === 'undefined' || !isTauri()) return null;
  return (command, args) => tauriInvoke(command, args);
}

const indexEnabled = () => vaultIndexPreference.read() === 'on';

function offStatus(): VectorStatus {
  return { ...OFF_VECTOR_STATUS };
}

function emptyProbe(): VectorProbe {
  return {
    files: 0,
    builtin: {
      onDisk: false,
      downloadBytes: 0,
      keptBytes: 0,
      neededFreeBytes: 0,
      freeBytes: 0,
      memoryBytes: 0,
      accelerated: false,
    },
    runner: null,
  };
}

function notFound(): VectorFound {
  return { state: 'notReady', failure: null, hits: [], staleDropped: 0, filesReady: 0, filesTotal: 0 };
}

/** What the setup dialog states; a runner address is asked only when it is on this computer. */
export async function probeVectors(rootPath: string, runnerBaseUrl: string | null): Promise<VectorProbe> {
  const invoke = getInvoke();
  if (!invoke) return emptyProbe();
  return invoke('vault_vectors_probe', { rootPath, runnerBaseUrl });
}

/** Never creates anything; sends the search index switch, since vectors live beside the index. */
export async function vectorStatus(
  rootPath: string,
  source: VectorSource | null,
  paused = false,
): Promise<VectorStatus> {
  const invoke = getInvoke();
  if (!invoke) return offStatus();
  return invoke('vault_vectors_status', { rootPath, enabled: indexEnabled(), source, paused });
}

/** Starts or continues the folder's background job (the built-in model first when it is missing). */
export async function prepareVectors(rootPath: string, source: VectorSource): Promise<VectorStatus> {
  const invoke = getInvoke();
  if (!invoke) return offStatus();
  return invoke('vault_vectors_prepare', { rootPath, source });
}

/** Stops at the next batch or download chunk; everything prepared stays. */
export async function stopVectors(rootPath: string): Promise<VectorStatus> {
  const invoke = getInvoke();
  if (!invoke) return offStatus();
  return invoke('vault_vectors_stop', { rootPath });
}

/** Loads the built-in model for a question about to be asked; returns at once, never downloads. */
export async function warmVectors(source: VectorSource): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) return;
  await invoke('vault_vectors_warm', { source });
}

/** The nearest passages, each still held by its file; a failure is a state, never a throw. */
export async function searchVectors(
  rootPath: string,
  source: VectorSource,
  question: string,
  limit: number,
): Promise<VectorFound> {
  const invoke = getInvoke();
  if (!invoke) return notFound();
  return invoke('vault_vectors_search', {
    rootPath,
    source,
    question,
    limit: Math.max(0, Math.min(MAX_VECTOR_HITS, Math.floor(limit))),
  });
}

/** Deletes this folder's vectors and ends its job; the folder itself is never touched. */
export async function deleteVectors(rootPath: string): Promise<VectorStatus> {
  const invoke = getInvoke();
  if (!invoke) return offStatus();
  return invoke('vault_vectors_delete', { rootPath });
}

/** Ends every job using the built-in model, then deletes the model; prepared vectors stay. */
export async function deleteVectorModel(): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) return;
  await invoke('vault_vectors_delete_model');
}

/**
 * Calls `listener` with every folder's status events: on each phase change and, while a job runs,
 * between four times a second and once every two seconds. Returns the unsubscribe at once; on the
 * web nothing fires.
 */
export function subscribeVectorStatus(listener: (event: VectorStatusEvent) => void): () => void {
  if (!getInvoke()) return () => undefined;
  let unsubscribed = false;
  let unlisten: (() => void) | null = null;
  listen<VectorStatusEvent>(STATUS_EVENT, (event) => {
    if (!unsubscribed) listener(event.payload);
  })
    .then((stop) => {
      if (unsubscribed) stop();
      else unlisten = stop;
    })
    .catch(() => undefined);
  return () => {
    unsubscribed = true;
    unlisten?.();
    unlisten = null;
  };
}
