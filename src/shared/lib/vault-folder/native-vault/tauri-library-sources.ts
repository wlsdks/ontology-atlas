import { Channel } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import { getTauriInvoke } from './tauri-vault-runtime';

/**
 * The native "add documents" picker. Returns the absolute paths a person chose, or an
 * empty list when they cancelled; `null` outside the app, where `showOpenFilePicker`
 * does the same job in the browser.
 */
export async function pickTauriSourceFiles(dialogTitle?: string): Promise<string[] | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke<string[]>('pick_source_files', dialogTitle ? { dialogTitle } : undefined);
}

export interface TauriSourceImportResult {
  pickedName: string;
  status: 'added' | 'duplicate' | 'renamed' | 'failed';
  relativePath: string | null;
  sha256: string | null;
  size: number | null;
  reason: string | null;
}

/** The two fixed folders an import lands in; Rust refuses any other value. */
export type TauriSourceImportDestination = 'sources' | 'planning';

/** Copies chosen files into `<vault>/sources/` (or `planning/`), refusing bytes already there. */
export async function importTauriSourceFiles(
  rootPath: string,
  sourcePaths: readonly string[],
  destination?: TauriSourceImportDestination,
): Promise<TauriSourceImportResult[] | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke<TauriSourceImportResult[]>('import_source_files', {
    rootPath,
    sourcePaths: [...sourcePaths],
    ...(destination ? { destination } : {}),
  });
}

export interface SourceImportProgress {
  done: number;
  total: number;
}

/**
 * Copies paths Rust offered (picked, discovered or dropped) into `sources/`, each under the folders
 * Rust recorded for it, streaming progress. A path Rust never offered fails `source-not-offered`.
 */
export async function importTauriOfferedSources(
  rootPath: string,
  sourcePaths: readonly string[],
  importId: string,
  onProgress: (progress: SourceImportProgress) => void,
): Promise<TauriSourceImportResult[] | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  const progress = new Channel<SourceImportProgress>();
  progress.onmessage = onProgress;
  return invoke<TauriSourceImportResult[]>('import_offered_sources', {
    rootPath,
    sourcePaths: [...sourcePaths],
    importId,
    progress,
  });
}

/** Stops the named import after the file it is copying; what landed stays. */
export async function stopTauriSourceImport(importId: string): Promise<boolean> {
  const invoke = getTauriInvoke();
  if (!invoke) return false;
  return invoke<boolean>('stop_source_import', { importId });
}

/** Creates `sources/` when missing and selects it in Finder, File Explorer or the file manager. */
export async function revealTauriSourcesFolder(rootPath: string): Promise<boolean> {
  const invoke = getTauriInvoke();
  if (!invoke) return false;
  await invoke('reveal_sources_folder', { rootPath });
  return true;
}

export type TauriSourceSkipReason = 'secretName' | 'licence' | 'notDocument';

export interface TauriDropOffer {
  /** Each `path` is the string to send back; `relativePath` is where it lands under `sources/`. */
  files: { path: string; relativePath: string; size: number }[];
  /** The first thousand skipped files; `skippedCounts` counts every one. */
  skipped: { relativePath: string; reason: TauriSourceSkipReason }[];
  skippedCounts: Record<TauriSourceSkipReason, number>;
  totalBytes: number;
  truncated: boolean;
  /** Dropped folders refused whole because they are, or hold, an open folder. */
  holdsOpenFolder: string[];
}

export type TauriSourceDropEvent =
  | { phase: 'over' }
  | { phase: 'leave' }
  | { phase: 'reading' }
  | { phase: 'offered'; offer: TauriDropOffer };

/** Rust walks a native drop only while armed, so a drop on another screen reads nothing. */
export async function armTauriSourceDrop(armed: boolean): Promise<void> {
  const invoke = getTauriInvoke();
  if (!invoke) return;
  await invoke('arm_source_drop', { armed });
}

/** Native window drops, offered by Rust; `null` outside the app, where the page's own drop events serve. */
export function subscribeTauriSourceDrop(
  listener: (event: TauriSourceDropEvent) => void,
): (() => void) | null {
  if (!getTauriInvoke()) return null;
  let stopped = false;
  let unlisten: (() => void) | null = null;
  void listen<TauriSourceDropEvent>('source-drop', (event) => {
    if (!stopped) listener(event.payload);
  }).then((stop) => {
    if (stopped) stop();
    else unlisten = stop;
  }, () => undefined);
  return () => {
    stopped = true;
    unlisten?.();
    unlisten = null;
  };
}

export interface TauriSourceDiscoveryRoot {
  rootPath: string;
  label: string;
  skipRelative?: string[];
  /** The open folder: the only root whose Markdown is offered. */
  openFolder?: boolean;
}

interface TauriSourceCandidate {
  rootPath: string;
  rootLabel: string;
  relativePath: string;
  name: string;
  extension: string;
  size: number;
  mtime: number;
}

export interface TauriSourceDiscoveryReport {
  candidates: TauriSourceCandidate[];
  truncated: boolean;
  unreadableRoots: string[];
}

/**
 * Proposes documents from roots a person already granted — **metadata only**. Nothing is
 * opened and nothing is copied; the person picks from the list first.
 */
export async function discoverTauriSourceCandidates(
  roots: readonly TauriSourceDiscoveryRoot[],
): Promise<TauriSourceDiscoveryReport | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke<TauriSourceDiscoveryReport>('discover_source_candidates', {
    roots: roots.map((root) => ({ ...root, skipRelative: root.skipRelative ?? [] })),
  });
}
