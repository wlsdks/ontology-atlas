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
 * Error classification the picker localizes. `access-failed` is any other failure and its
 * `errorMessage` carries the cause string (a Tauri `Err(String)`); `root-rejected` has none.
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
  /** Raw sources under `sources/` by vault-relative path; a handle is reached only on open or hash. */
  sourceHandles: Map<string, FileSystemFileHandle>;
  errorMessage: string | null;
  /** Meaningful only in the error status — the key the picker uses to pick localized guidance. */
  errorCode: VaultErrorCode | null;
  /** Epoch ms of the last successful scan, shown by the picker as "scanned N seconds ago". */
  lastLoadedAt: number | null;
  /** The handle `manifest` was built from: tells "re-reading" from "switching" folders. */
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

/** Every member is a stable identity; dependency arrays list them. */
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
