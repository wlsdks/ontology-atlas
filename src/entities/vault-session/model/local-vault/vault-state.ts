import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { AcpWorkReceipt } from '@/shared/lib/acp-work-receipt';
import type { AgentActivityEntry } from '@/shared/lib/agent-activity-log';
import type { VaultManifest, VaultStampIndex } from '@/entities/docs-vault';
import { emptyAgentActivityStatus, type AgentActivityStatus } from '../agent-activity-status';
import type { AgentConfigStatus } from './vault-sidecars';
import type { VaultOpenOptions, VaultOpenResult } from './vault-starter';

type Status =
  | 'idle'
  | 'opening'
  | 'loading'
  | 'loaded'
  | 'permission-needed'
  | 'unsupported'
  | 'error';

/**
 * A human-readable classification of the error status. The picker chooses its localized
 * guidance from this code, which keeps the hook itself i18n-free.
 *
 * - `path-missing` — (desktop) the vault folder opened previously has moved or been
 *   deleted and is no longer reachable by absolute path. "Choose the folder again" is
 *   the next action.
 * - `permission-denied` — the operating system is protecting this folder and has not been told to
 *   allow it. Its own code because the remedy is a checkbox in System Settings, not a retry, and
 *   because the raw `Operation not permitted (os error 1)` names an errno rather than a folder.
 *   Classified from the OS message, never guessed from the path — see
 *   `classify-vault-access-error.ts`.
 * - `access-failed` — any other read or build failure. `errorMessage` carries the cause
 *   string, including a Tauri command's `Err(String)`, so it is no longer silent.
 * - `root-rejected` — the chosen location cannot be a vault root (a filesystem root, the
 *   home directory itself, an OS or app directory). This is a **rejection, not a
 *   failure**, and gets its own code because retrying gives the same result — "please try
 *   again" would be wrong guidance. `errorMessage` is null and the screen picks the
 *   reason in its own language (`vaultRootRejectionReason`).
 */
type VaultErrorCode =
  | 'path-missing'
  | 'grant-needed'
  | 'permission-denied'
  | 'access-failed'
  | 'root-rejected';

export interface State {
  status: Status;
  handle: FileSystemDirectoryHandle | null;
  manifest: VaultManifest | null;
  agentConfigStatus: AgentConfigStatus | null;
  agentActivityStatus: AgentActivityStatus;
  /** Tail of the local audit log; empty array when absent. */
  agentActivityLog: AgentActivityEntry[];
  /** App-local human decision receipts from `.ontology-atlas/acp-work.jsonl`. */
  acpWorkReceipts: AcpWorkReceipt[];
  fileHandles: Map<string, FileSystemFileHandle>;
  imageHandles: Map<string, FileSystemFileHandle>;
  /**
   * Raw sources under `sources/`, keyed by vault-relative path. Nothing here is opened
   * by the build; a handle is reached through only when a person asks to open or hash
   * one file.
   */
  sourceHandles: Map<string, FileSystemFileHandle>;
  errorMessage: string | null;
  /** Meaningful only in the error status — the key the picker uses to pick localized guidance. */
  errorCode: VaultErrorCode | null;
  /** Epoch ms of the last successful scan, shown by the picker as "scanned N seconds ago". */
  lastLoadedAt: number | null;
  /**
   * **Which handle** `manifest` was built from. Kept separate from `handle` because a
   * rescan (`load`) sets `handle` to the new value and status to 'loading' the moment it
   * starts, while `manifest` is still the previous one. Comparing the two distinguishes
   * "re-reading the same folder" (content still valid) from "switching folders" (content
   * invalid) — without that distinction, the second it takes to switch draws the other
   * folder's graph.
   */
  manifestHandle: FileSystemDirectoryHandle | null;
  partialTotal: number;
}

export function withArrivedPart(s: State, partialTotal: number): State {
  if (s.manifest === null && s.manifestHandle === null) return { ...s, partialTotal };
  return {
    ...s,
    partialTotal,
    manifest: null,
    manifestHandle: null,
    agentConfigStatus: null,
    agentActivityStatus: emptyAgentActivityStatus(),
    agentActivityLog: [],
    acpWorkReceipts: [],
    fileHandles: new Map(),
    imageHandles: new Map(),
    sourceHandles: new Map(),
  };
}

export function emptyState(status: Status = 'idle'): State {
  return {
    status,
    handle: null,
    manifest: null,
    agentConfigStatus: null,
    agentActivityStatus: emptyAgentActivityStatus(),
    agentActivityLog: [],
    acpWorkReceipts: [],
    fileHandles: new Map(),
    imageHandles: new Map(),
    sourceHandles: new Map(),
    errorMessage: null,
    errorCode: null,
    lastLoadedAt: null,
    manifestHandle: null,
    partialTotal: 0,
  };
}

export interface VaultSessionCore {
  setState: Dispatch<SetStateAction<State>>;
  stateRef: RefObject<State>;
  setAwaitingVaultChoice: Dispatch<SetStateAction<boolean>>;
  vaultReadSessionRef: RefObject<{ handle: FileSystemDirectoryHandle | null }>;
  pickerSequenceRef: RefObject<number>;
  mountedRef: RefObject<boolean>;
  beginVaultReadSession: (handle: FileSystemDirectoryHandle | null) => { handle: FileSystemDirectoryHandle | null };
  load: (
    handle: FileSystemDirectoryHandle,
    options?: VaultOpenOptions,
    nativeStamps?: VaultStampIndex | null,
  ) => Promise<Omit<VaultOpenResult, 'opened'> | null>;
}
