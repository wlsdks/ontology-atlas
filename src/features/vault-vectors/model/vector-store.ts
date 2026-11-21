'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  deleteVectorModel,
  deleteVectors,
  OFF_VECTOR_STATUS,
  prepareVectors,
  stopVectors,
  subscribeVectorStatus,
  vectorStatus,
  type VectorSource,
  type VectorStatus,
} from '@/shared/lib/vault-folder/vault-vectors/tauri-vault-vectors';
import { vaultVectorSource } from '@/shared/lib/vault-folder/vault-vectors/vault-vector-source';

/** One event subscription feeds every screen, so leaving the Library and coming back reads the job where it is. */
const statuses = new Map<string, VectorStatus>();
const listeners = new Set<() => void>();
const reading = new Map<string, Promise<void>>();
const presses = new Map<string, number>();
let pressCount = 0;
let unsubscribeEvents: (() => void) | null = null;

function publish(rootPath: string, status: VectorStatus): void {
  statuses.set(rootPath, status);
  for (const listener of listeners) listener();
}

function recordPress(rootPath: string): void {
  pressCount += 1;
  presses.set(rootPath, pressCount);
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  unsubscribeEvents ??= subscribeVectorStatus(({ rootPath, status }) => publish(rootPath, status));
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

type Answer = true | { refused: string };

/** A rejected command keeps the last status; the warning names the command, never the folder. */
async function answer(command: string, rootPath: string | null, call: () => Promise<VectorStatus | void>): Promise<Answer> {
  try {
    const status = await call();
    if (rootPath !== null && status) publish(rootPath, status);
    return true;
  } catch (error) {
    console.warn(`search by meaning: ${command} was refused`);
    return { refused: typeof error === 'string' ? error : '' };
  }
}

/** Codes Rust refuses the source itself with (`check_source`); a refused folder says nothing about the choice, which waits for the folder. */
const refusesTheChoice = (answered: Answer) =>
  answered !== true && (answered.refused.startsWith('embed-') || answered.refused.startsWith('vectors-model-name'));

function refused(rootPath: string, answered: Answer): void {
  if (!refusesTheChoice(answered)) return;
  vaultVectorSource.clear(rootPath);
  publish(rootPath, { ...OFF_VECTOR_STATUS, phase: 'notSetUp' });
}

function refresh(rootPath: string): Promise<void> {
  const inFlight = reading.get(rootPath);
  if (inFlight) return inFlight;
  const choice = vaultVectorSource.read(rootPath);
  const read = answer('vault_vectors_status', rootPath, () => vectorStatus(rootPath, choice?.source ?? null, choice?.paused ?? false))
    .then((answered) => { if (answered !== true && choice !== null) refused(rootPath, answered); })
    .finally(() => reading.delete(rootPath));
  reading.set(rootPath, read);
  return read;
}

export function useVectorStatus(rootPath: string | null): VectorStatus | null {
  const getSnapshot = useCallback(() => (rootPath === null ? null : statuses.get(rootPath) ?? null), [rootPath]);
  const status = useSyncExternalStore(subscribe, getSnapshot, () => null);
  useEffect(() => {
    if (rootPath !== null && !statuses.has(rootPath)) void refresh(rootPath);
  }, [rootPath]);
  return status;
}

/** A caller renders only when the selected value changes, so a yes-or-no screen is not redrawn on every progress event. */
export function useVectorStatusOf<T>(rootPath: string | null, select: (status: VectorStatus | null) => T): T {
  const getSnapshot = () => select(rootPath === null ? null : statuses.get(rootPath) ?? null);
  const value = useSyncExternalStore(subscribe, getSnapshot, () => select(null));
  useEffect(() => {
    if (rootPath !== null && !statuses.has(rootPath)) void refresh(rootPath);
  }, [rootPath]);
  return value;
}

export function readStatusAgain(rootPath: string): Promise<void> {
  return refresh(rootPath);
}

/** Resolves at the first status after this call that runs no pass; called once a search answered `busy`. */
export function afterJob(rootPath: string): Promise<void> {
  const before = statuses.get(rootPath);
  return new Promise((resolve) => {
    const stopListening = subscribe(() => {
      const status = statuses.get(rootPath);
      if (status === before || status?.busy !== false) return;
      stopListening();
      resolve();
    });
  });
}

export function statusOf(rootPath: string): VectorStatus | null {
  return statuses.get(rootPath) ?? null;
}

/** `null` when the job continues by itself (a restart, an update of changed files). */
export function pressOf(rootPath: string): number | null {
  return presses.get(rootPath) ?? null;
}

const sameSource = (a: VectorSource, b: VectorSource) =>
  a.kind === b.kind && (a.kind === 'builtin' || (b.kind === 'runner' && a.baseUrl === b.baseUrl && a.model === b.model));

/** Only the dialog's Download and prepare passes `download`: no other press fetches the model. */
export async function prepare(rootPath: string, source: VectorSource, download = false): Promise<boolean> {
  const earlier = vaultVectorSource.read(rootPath);
  recordPress(rootPath);
  const answered = await answer('vault_vectors_prepare', rootPath, () => prepareVectors(rootPath, source, download));
  if (answered === true) vaultVectorSource.write(rootPath, source);
  else if (earlier && !sameSource(earlier.source, source)) await refresh(rootPath);
  else refused(rootPath, answered);
  return answered === true;
}

/** The pause is stored, so the next opening keeps the job stopped. */
export function stop(rootPath: string): Promise<boolean> {
  vaultVectorSource.setPaused(rootPath, true);
  return answer('vault_vectors_stop', rootPath, () => stopVectors(rootPath)).then((answered) => answered === true);
}

/** Never downloads: a missing model answers `modelGone`, whose press opens the dialog. */
export async function resume(rootPath: string): Promise<boolean> {
  const choice = vaultVectorSource.read(rootPath);
  if (choice === null) return false;
  vaultVectorSource.setPaused(rootPath, false);
  recordPress(rootPath);
  const answered = await answer('vault_vectors_prepare', rootPath, () => prepareVectors(rootPath, choice.source));
  if (answered !== true) refused(rootPath, answered);
  return answered === true;
}

export async function remove(rootPath: string): Promise<boolean> {
  const removed = (await answer('vault_vectors_delete', rootPath, () => deleteVectors(rootPath))) === true;
  if (removed) vaultVectorSource.clear(rootPath);
  return removed;
}

export async function removeModel(): Promise<boolean> {
  const removed = (await answer('vault_vectors_delete_model', null, () => deleteVectorModel())) === true;
  await Promise.all([...statuses.keys()].map((rootPath) => refresh(rootPath)));
  return removed;
}

/** `null` means every folder. */
export async function forgetChoices(rootPath: string | null): Promise<void> {
  if (rootPath === null) vaultVectorSource.clearAll();
  else vaultVectorSource.clear(rootPath);
  await Promise.all([...statuses.keys()].map((root) => refresh(root)));
}
