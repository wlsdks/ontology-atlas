'use client';

import { useSyncExternalStore } from 'react';

import {
  MACHINE_APPROVALS_STORAGE_KEY,
  parseApprovals,
  serializeApprovals,
  type ApprovalEntry,
  type ApprovalSubject,
} from './machine-approvals-format';

/**
 * The connector and round definitions this Mac allowed, per absolute folder path. The folder's
 * `enabled` can arrive from a clone or a pull, so consent lives here and never travels with it.
 * An entry is the whole canonical definition, not a hash, so nothing crafted can collide with it.
 * It only restricts: missing or corrupt means not allowed, and the web, with no path, allows none.
 */

const CHANGE_EVENT = 'ontology-atlas:machine-approvals-change';

export interface MachineApprovals {
  allowed(subject: ApprovalSubject, folder: string | null, id: string): string | null;
  approves(subject: ApprovalSubject, folder: string | null, id: string, fingerprint: string): boolean;
}

/** A `Map`, so an id a folder file supplies, such as `__proto__`, stays a key. */
type Table = Map<string, ApprovalEntry>;

const keyOf = (subject: ApprovalSubject, folder: string, id: string) => `${subject}\u0000${folder}\u0000${id}`;

function tableOf(entries: readonly ApprovalEntry[]): Table {
  return new Map(entries.map((entry) => [keyOf(entry[0], entry[1], entry[2]), entry]));
}

function snapshotOf(table: Table): MachineApprovals {
  const allowed = (subject: ApprovalSubject, folder: string | null, id: string) =>
    folder ? (table.get(keyOf(subject, folder, id))?.[3] ?? null) : null;
  return {
    allowed,
    approves: (subject, folder, id, fingerprint) => allowed(subject, folder, id) === fingerprint,
  };
}

const NONE: MachineApprovals = snapshotOf(new Map());

/** A refused write keeps the press for this run; it wins until a write succeeds. */
let unsaved: Table | null = null;
let cache: { source: string | Table | null; table: Table; snapshot: MachineApprovals } | null = null;

function source(): string | Table | null {
  if (unsaved) return unsaved;
  try {
    return window.localStorage.getItem(MACHINE_APPROVALS_STORAGE_KEY);
  } catch {
    return null;
  }
}

function current(): { table: Table; snapshot: MachineApprovals } {
  const from = source();
  if (cache && cache.source === from) return cache;
  const table = typeof from === 'string' || from === null ? tableOf(parseApprovals(from)) : from;
  cache = { source: from, table, snapshot: snapshotOf(table) };
  return cache;
}

export function readMachineApprovals(): MachineApprovals {
  if (typeof window === 'undefined') return NONE;
  return current().snapshot;
}

function write(change: (table: Table) => void): boolean {
  if (typeof window === 'undefined') return false;
  const table: Table = new Map(current().table);
  change(table);
  try {
    window.localStorage.setItem(MACHINE_APPROVALS_STORAGE_KEY, serializeApprovals([...table.values()]));
    unsaved = null;
  } catch {
    unsaved = table;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return true;
}

/** Only a press on this computer records one. False without a folder path. */
export function recordApproval(
  subject: ApprovalSubject,
  folder: string | null,
  id: string,
  fingerprint: string,
): boolean {
  if (!folder || !id) return false;
  return write((table) => {
    table.set(keyOf(subject, folder, id), [subject, folder, id, fingerprint]);
  });
}

export function forgetApproval(subject: ApprovalSubject, folder: string | null, id: string): void {
  if (!folder || !id) return;
  if (!current().table.has(keyOf(subject, folder, id))) return;
  write((table) => {
    table.delete(keyOf(subject, folder, id));
  });
}

export function subscribeMachineApprovals(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === MACHINE_APPROVALS_STORAGE_KEY) onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

const serverSnapshot = () => NONE;

export function useMachineApprovals(): MachineApprovals {
  return useSyncExternalStore(subscribeMachineApprovals, readMachineApprovals, serverSnapshot);
}
