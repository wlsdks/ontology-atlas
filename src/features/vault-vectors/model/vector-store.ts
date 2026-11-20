'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  deleteVectorModel,
  deleteVectors,
  prepareVectors,
  stopVectors,
  subscribeVectorStatus,
  vectorStatus,
  type VectorSource,
  type VectorStatus,
} from '@/shared/lib/vault-folder/tauri-vault-vectors';
import { vaultVectorSource } from '@/shared/lib/vault-folder/vault-vector-source';

/**
 * The app session's last search-by-meaning status per folder root. One event subscription feeds
 * it for every screen, so leaving the Library and coming back reads the job where it is.
 */
const statuses = new Map<string, VectorStatus>();
const listeners = new Set<() => void>();
const reading = new Map<string, Promise<void>>();
/** The last press that started or resumed each folder's job in this launch, numbered in order. */
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

/** A rejected command keeps the last status; the warning names the command, never the folder. */
async function answer(command: string, rootPath: string | null, call: () => Promise<VectorStatus | void>): Promise<boolean> {
  try {
    const status = await call();
    if (rootPath !== null && status) publish(rootPath, status);
    return true;
  } catch {
    console.warn(`search by meaning: ${command} was refused`);
    return false;
  }
}

/** Asks Rust for the folder's status once at a time, with the stored choice and its pause. */
function refresh(rootPath: string): Promise<void> {
  const inFlight = reading.get(rootPath);
  if (inFlight) return inFlight;
  const choice = vaultVectorSource.read(rootPath);
  const read = answer('vault_vectors_status', rootPath, () => vectorStatus(rootPath, choice?.source ?? null, choice?.paused ?? false))
    .then(() => undefined)
    .finally(() => reading.delete(rootPath));
  reading.set(rootPath, read);
  return read;
}

/** The folder's last known status, or `null` until the first answer; asks once when none is held. */
export function useVectorStatus(rootPath: string | null): VectorStatus | null {
  const getSnapshot = useCallback(() => (rootPath === null ? null : statuses.get(rootPath) ?? null), [rootPath]);
  const status = useSyncExternalStore(subscribe, getSnapshot, () => null);
  useEffect(() => {
    if (rootPath !== null && !statuses.has(rootPath)) void refresh(rootPath);
  }, [rootPath]);
  return status;
}

/** The folder's last known status without asking for one: the long-work seat only listens. */
export function statusOf(rootPath: string): VectorStatus | null {
  return statuses.get(rootPath) ?? null;
}

/**
 * The press that last started or resumed this folder's job in this launch, or `null` when the job
 * continues by itself (a restart, an update of changed files).
 */
export function pressOf(rootPath: string): number | null {
  return presses.get(rootPath) ?? null;
}

/** Stores the choice first, unpaused, so the folder's next open continues even if this launch ends now. */
export function prepare(rootPath: string, source: VectorSource): Promise<boolean> {
  vaultVectorSource.write(rootPath, source);
  recordPress(rootPath);
  return answer('vault_vectors_prepare', rootPath, () => prepareVectors(rootPath, source));
}

/** The pause is the person's: it is stored, so the next opening keeps the job stopped. */
export function stop(rootPath: string): Promise<boolean> {
  vaultVectorSource.setPaused(rootPath, true);
  return answer('vault_vectors_stop', rootPath, () => stopVectors(rootPath));
}

/** Prepares again with the stored source; without one there is nothing to resume. */
export function resume(rootPath: string): Promise<boolean> {
  const choice = vaultVectorSource.read(rootPath);
  if (choice === null) return Promise.resolve(false);
  vaultVectorSource.setPaused(rootPath, false);
  recordPress(rootPath);
  return answer('vault_vectors_prepare', rootPath, () => prepareVectors(rootPath, choice.source));
}

/** Deletes this folder's vectors and forgets its choice once Rust says they are gone. */
export async function remove(rootPath: string): Promise<boolean> {
  const removed = await answer('vault_vectors_delete', rootPath, () => deleteVectors(rootPath));
  if (removed) vaultVectorSource.clear(rootPath);
  return removed;
}

/** Deletes the built-in model; prepared vectors stay, and each known folder reads its status again. */
export async function removeModel(): Promise<boolean> {
  const removed = await answer('vault_vectors_delete_model', null, () => deleteVectorModel());
  await Promise.all([...statuses.keys()].map((rootPath) => refresh(rootPath)));
  return removed;
}

/** The search index's own Delete or switch-off removed the vectors with it; `null` means every folder. */
export async function forgetChoices(rootPath: string | null): Promise<void> {
  if (rootPath === null) vaultVectorSource.clearAll();
  else vaultVectorSource.clear(rootPath);
  await Promise.all([...statuses.keys()].map((root) => refresh(root)));
}
