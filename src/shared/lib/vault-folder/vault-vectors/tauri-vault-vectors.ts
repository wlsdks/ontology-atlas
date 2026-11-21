import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { vaultIndexPreference } from '../vault-index/tauri-vault-index';

/**
 * The installed app's search by meaning (`src-tauri/src/vault/vectors.rs`): a vector for each
 * passage of the folder's Markdown files, kept beside the search index in the OS cache folder and
 * prepared by a model on this computer. Code names it by what it stores, vectors; "meaning" in code
 * already names accepted product meaning. The web has none: every call here answers the `off`
 * status or an empty result and never throws. In the app every call but `searchVectors` and
 * `subscribeVectorStatus` may reject with the command's coded error (`vectorStatus` too: a folder
 * not chosen, or a source no screen offers).
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
  failure: VectorFailure | null;
  failureDetail: string | null;
  filesDone: number;
  filesTotal: number;
  passagesDone: number;
  passagesTotal: number;
  updating: boolean;
  currentPath: string | null;
  /** Over at least the last 30 s; `null` until measured. */
  passagesPerSecond: number | null;
  /**
   * While `modelDownloading`, and beside `modelGone` with what a cut-off download kept. `checking`
   * while that kept part is hashed again, before any byte comes from the network.
   */
  model: { doneBytes: number; totalBytes: number; checking: boolean } | null;
  vectorsBytes: number;
  /** A pass runs or follows the running one; an update reads `ready` until it knows what changed. */
  busy: boolean;
}

export interface VectorProbe {
  files: number;
  builtin: {
    onDisk: boolean;
    /** What the model holds in the app's data folder, a partial download included; 0 when nothing is there. */
    modelBytes: number;
    downloadBytes: number;
    keptBytes: number;
    neededFreeBytes: number;
    freeBytes: number;
    memoryBytes: number;
    accelerated: boolean;
    /** Where the model is kept on this computer; empty when the app has no data folder. */
    modelDir: string;
  };
  runner: { state: 'reachable' | 'unreachable' | 'notLocal'; address: string; models: string[] } | null;
}

export interface PassageHit {
  path: string;
  lineStart: number;
  lineEnd: number;
  heading: string;
  score: number;
}

export interface VectorFound {
  state: 'ok' | 'notReady' | 'failed';
  failure: VectorFailure | null;
  hits: PassageHit[];
  staleDropped: number;
  filesReady: number;
  filesTotal: number;
  /** The folder's `busy` once the search answered, the update a stale passage started included. */
  busy: boolean;
}

export interface VectorStatusEvent {
  rootPath: string;
  status: VectorStatus;
}

export const MAX_VECTOR_HITS = 64;

/** A search names at most this many path prefixes, each at most `MAX_VECTOR_PREFIX_BYTES` long. */
export const MAX_VECTOR_PREFIXES = 16;
export const MAX_VECTOR_PREFIX_BYTES = 512;

/**
 * The hosts the built-in model downloads from, the same list as `MODEL_DOWNLOAD_HOSTS` in
 * `src-tauri/src/llm/embed/builtin/download.rs` (a subdomain of one is that host); the Settings
 * outbound row and the setup dialog name exactly these.
 */
export const MODEL_DOWNLOAD_HOSTS = ['huggingface.co', 'hf.co'] as const;

/** The only details `modelFailed` carries; anything else is said with the generic sentence. */
export const MODEL_FAILED_DETAILS = ['load', 'convert', 'check', 'worker-exited', 'timed-out', 'internal'] as const;
export type ModelFailedDetail = (typeof MODEL_FAILED_DETAILS)[number];

export function modelFailedDetail(detail: string | null): ModelFailedDetail | null {
  return (MODEL_FAILED_DETAILS as readonly string[]).includes(detail ?? '') ? detail as ModelFailedDetail : null;
}

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
  busy: false,
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
      modelBytes: 0,
      downloadBytes: 0,
      keptBytes: 0,
      neededFreeBytes: 0,
      freeBytes: 0,
      memoryBytes: 0,
      accelerated: false,
      modelDir: '',
    },
    runner: null,
  };
}

function notFound(): VectorFound {
  return { state: 'notReady', failure: null, hits: [], staleDropped: 0, filesReady: 0, filesTotal: 0, busy: false };
}

/**
 * What the setup dialog states; a runner address is asked only when it is on this computer, and
 * one that is not answers `notLocal`. `rootPath` is `null` when no folder is open: Settings then
 * reads only what the model holds. Rejects with the command's coded error for a folder not chosen.
 */
export async function probeVectors(rootPath: string | null, runnerBaseUrl: string | null): Promise<VectorProbe> {
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

/**
 * Starts or continues the folder's background job, and lets a stopped or failed folder go. Only a
 * call with `download` fetches the built-in model; without it a missing model answers `failed`
 * with `modelGone` and nothing is fetched or created. With the search index off it answers `off`
 * and creates nothing. Rejects with the command's coded error for a folder not chosen or a source
 * no screen offers.
 */
export async function prepareVectors(
  rootPath: string,
  source: VectorSource,
  download = false,
): Promise<VectorStatus> {
  const invoke = getInvoke();
  if (!invoke) return offStatus();
  return invoke('vault_vectors_prepare', { rootPath, enabled: indexEnabled(), source, download });
}

/**
 * Stops at once and holds the folder: no update starts until `prepareVectors`. Everything prepared
 * stays. Rejects with the command's coded error for a folder not chosen.
 */
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

/**
 * The nearest passages, each still held by its file, among the files whose path starts with one of
 * `prefixes` (byte for byte; empty means every file). A failure is a state, never a throw: a
 * rejected command answers `failed` with no hits. A limit that is not a finite number is 0.
 */
export async function searchVectors(
  rootPath: string,
  source: VectorSource,
  question: string,
  limit: number,
  prefixes: readonly string[] = [],
): Promise<VectorFound> {
  const invoke = getInvoke();
  if (!invoke) return notFound();
  const kept = Number.isFinite(limit) ? Math.max(0, Math.min(MAX_VECTOR_HITS, Math.floor(limit))) : 0;
  try {
    return await invoke<VectorFound>('vault_vectors_search', { rootPath, source, question, limit: kept, prefixes: [...prefixes] });
  } catch {
    return { ...notFound(), state: 'failed' };
  }
}

/**
 * Deletes this folder's vectors and ends its job; the folder itself is never touched. Rejects with
 * the command's coded error for a folder not chosen.
 */
export async function deleteVectors(rootPath: string): Promise<VectorStatus> {
  const invoke = getInvoke();
  if (!invoke) return offStatus();
  return invoke('vault_vectors_delete', { rootPath });
}

/**
 * Ends every job using the built-in model, then deletes the model; prepared vectors stay. Rejects
 * with a coded error while a job still holds the model.
 */
export async function deleteVectorModel(): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) return;
  await invoke('vault_vectors_delete_model');
}

/** Shows the built-in model's folder in Finder or Explorer; rejects when the model holds no folder. */
export async function revealVectorModel(): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) return;
  await invoke('vault_vectors_reveal_model');
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
