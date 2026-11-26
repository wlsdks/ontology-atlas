'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CURRENT_LOCAL_FS_HANDLE_ID,
  deleteLocalFsHandle,
  forgetRecentLocalFsHandle,
  getLocalFsHandle,
  listRecentLocalFsHandles,
  putLocalFsHandle,
  touchLocalFsHandle,
  type LocalFsHandleRecord,
} from '@/entities/local-fs-handle';
import {
  pickTauriVaultDirectory,
  vaultRootRejectionReason,
} from '@/shared/lib/vault-folder/native-vault/tauri-vault-location';
import {
  getTauriVaultRootPath,
  isTauriVaultRuntime,
} from '@/shared/lib/vault-folder/native-vault/tauri-vault-runtime';
import { classifyVaultAccessError, isMissingFolderError } from '../vault-opening/classify-vault-access-error';
import { toErrorMessage } from '@/shared/lib/failures/error-message';
import { isPickerAbort } from '@/shared/lib/failures/picker-abort';
import { forgetVaultIndex } from '@/shared/lib/vault-folder/vault-index/tauri-vault-index';
import { vaultVectorSource } from '@/shared/lib/vault-folder/vault-vectors/vault-vector-source';
import { emptyAgentActivityStatus } from '../agent-activity-status';
import { ABSENT_MAP_ANALYSIS_RECORD } from '@/shared/lib/vault-document/map-analysis-record';
import {
  isSupported,
  resolveVaultHandle,
  tauriVaultRecordResolves,
  verifyRead,
} from './vault-handle';
import { NOT_OPENED, type VaultOpenOptions, type VaultOpenResult } from './vault-starter';
import { emptyState, type VaultSessionCore } from './vault-state';

export function useVaultChoice({
  setState,
  stateRef,
  setAwaitingVaultChoice,
  vaultReadSessionRef,
  pickerSequenceRef,
  mountedRef,
  beginVaultReadSession,
  load,
}: VaultSessionCore) {
  const [restoreAttempted, setRestoreAttempted] = useState(false);
  /**
   * The stored `current` record as read at boot: which folder the last session had open. The
   * chooser marks "last open" from it, since recent-list order moves on a touch or a failed open.
   */
  const [storedVaultRecord, setStoredVaultRecord] = useState<LocalFsHandleRecord | null>(
    null,
  );
  /**
   * Set when "open a folder" opened the map inside the picked folder (`atlas/`); holds the path
   * they picked so the screen can say so. `null` means nothing was substituted.
   */
  const [openedInsidePickedFolder, setOpenedInsidePickedFolder] = useState<string | null>(null);
  const [recentVaults, setRecentVaults] = useState<LocalFsHandleRecord[]>([]);

  const refreshRecentVaults = useCallback(async () => {
    setRecentVaults(await listRecentLocalFsHandles());
  }, []);

  /**
   * Picks a folder and opens it. `options.starter` is a creation door's request, written before
   * the folder is first shown if it holds no documents. The result says whether each landed.
   */
  const open = useCallback(async (options: VaultOpenOptions = {}): Promise<VaultOpenResult> => {
    if (!isSupported()) {
      setState(emptyState('unsupported'));
      return NOT_OPENED;
    }
    // A cancelled picker is not a state change: restore the exact status from before it opened.
    const previousState = stateRef.current;
    const pickerSequence = ++pickerSequenceRef.current;
    let session = vaultReadSessionRef.current;
    const isCurrent = () => mountedRef.current && pickerSequenceRef.current === pickerSequence &&
      vaultReadSessionRef.current === session;
    setState((s) => ({
      ...s,
      status: 'opening',
      errorMessage: null,
      errorCode: null,
    }));
    try {
      const handle = isTauriVaultRuntime()
        ? await pickTauriVaultDirectory()
        : await (
            window as unknown as {
              showDirectoryPicker: (options?: {
                mode?: 'read' | 'readwrite';
              }) => Promise<FileSystemDirectoryHandle>;
            }
          ).showDirectoryPicker({ mode: 'read' });
      if (!isCurrent()) return NOT_OPENED;
      if (!handle) {
        setState(previousState);
        return NOT_OPENED;
      }
      session = beginVaultReadSession(handle);
      /*
       * Picking the project means its map: `resolve-picked-vault-folder.ts` narrows to `atlas/`
       * and says why it is never silent.
       */
      const resolvedHandle = await resolveVaultHandle(handle);
      if (!isCurrent()) return NOT_OPENED;
      const openHandle = resolvedHandle.handle;
      session.handle = openHandle;
      setOpenedInsidePickedFolder(resolvedHandle.redirectedFrom);
      const now = Date.now();
      await putLocalFsHandle({
        id: CURRENT_LOCAL_FS_HANDLE_ID,
        handle: openHandle,
        name: openHandle.name,
        createdAt: now,
        lastAccessedAt: now,
      });
      if (!isCurrent()) return NOT_OPENED;
      /*
       * Add to the recent list only after the read succeeds: updating it first removes the
       * first-run surface, so a failed read would leave a silent sample map.
       */
      const loaded = await load(openHandle, options);
      if (!isCurrent()) return NOT_OPENED;
      await refreshRecentVaults();
      if (!isCurrent()) return NOT_OPENED;
      return loaded ? { opened: true, ...loaded } : NOT_OPENED;
    } catch (error) {
      if (!isCurrent()) return NOT_OPENED;
      if (isPickerAbort(error)) {
        setState(previousState);
        return NOT_OPENED;
      }
      // A "cannot be a vault root" rejection is not a failure: the cause string `vault-root-rejected:filesystem-root` would
      // read badly, and "please try again" is false guidance when every retry gives the same result.
      const rejection = vaultRootRejectionReason(error);
      if (rejection) {
        setState((s) => ({
          ...s,
          status: 'error',
          errorMessage: null,
          errorCode: 'root-rejected',
        }));
        return NOT_OPENED;
      }
      // `null` lets `LocalVaultPicker` fall back to `t('errorFallback')`.
      setState((s) => ({
        ...s,
        status: 'error',
        errorMessage: toErrorMessage(error),
        errorCode:
          classifyVaultAccessError(error) === 'permission-denied'
            ? 'permission-denied'
            : 'access-failed',
      }));
      return NOT_OPENED;
    }
  }, [beginVaultReadSession, load, refreshRecentVaults, stateRef, mountedRef, pickerSequenceRef, setState, vaultReadSessionRef]);

  const openRecent = useCallback(
    async (record: LocalFsHandleRecord, options: VaultOpenOptions = {}): Promise<VaultOpenResult> => {
      if (!isSupported()) {
        setState(emptyState('unsupported'));
        return NOT_OPENED;
      }
      pickerSequenceRef.current += 1;
      const session = beginVaultReadSession(record.handle);
      const isCurrent = () => mountedRef.current && vaultReadSessionRef.current === session;
      setState((s) => ({
        ...s,
        status: 'opening',
        errorMessage: null,
        errorCode: null,
      }));
      try {
        // Desktop reopens by absolute path with no picker: preflight so a moved or deleted folder
        // classifies as 'path-missing'. A present-but-ungranted vault is 'grant-needed', not a loss.
        const resolution = await tauriVaultRecordResolves(record);
        if (!isCurrent()) return NOT_OPENED;
        if (resolution !== 'ok') {
          setState((s) => ({
            ...s,
            status: 'error',
            errorMessage: null,
            errorCode: resolution === 'grant-needed' ? 'grant-needed' : 'path-missing',
          }));
          return NOT_OPENED;
        }
        const resolvedHandle = await resolveVaultHandle(record.handle);
        if (!isCurrent()) return NOT_OPENED;
        session.handle = resolvedHandle.handle;
        setOpenedInsidePickedFolder(resolvedHandle.redirectedFrom);
        const resolvedRootPath = getTauriVaultRootPath(resolvedHandle.handle);
        const now = Date.now();
        const nextRecord: LocalFsHandleRecord = {
          ...record,
          id: CURRENT_LOCAL_FS_HANDLE_ID,
          handle: resolvedHandle.handle,
          name: resolvedHandle.handle.name,
          desktopRootPath: resolvedRootPath ?? record.desktopRootPath,
          lastAccessedAt: now,
        };
        await putLocalFsHandle(nextRecord);
        if (!isCurrent()) return NOT_OPENED;
        await refreshRecentVaults();
        if (!isCurrent()) return NOT_OPENED;
        const loaded = await load(resolvedHandle.handle, options);
        if (!isCurrent()) return NOT_OPENED;
        return loaded ? { opened: true, ...loaded } : NOT_OPENED;
      } catch (error) {
        if (!isCurrent()) return NOT_OPENED;
        // `toErrorMessage` — a Tauri `invoke` rejects with `Err(String)` as a plain string.
        setState((s) => ({
          ...s,
          status: 'error',
          errorMessage: toErrorMessage(error),
          errorCode:
            classifyVaultAccessError(error) === 'permission-denied'
              ? 'permission-denied'
              : 'access-failed',
        }));
        return NOT_OPENED;
      }
    },
    [beginVaultReadSession, load, refreshRecentVaults, mountedRef, pickerSequenceRef, setState, vaultReadSessionRef],
  );

  /** Stops listing folders as known and deletes their search indexes; the folders are never touched. Every write goes through the store's queue and the list is read back once. */
  const forgetRecent = useCallback(
    async (target: LocalFsHandleRecord | readonly LocalFsHandleRecord[]) => {
      const records = ([] as LocalFsHandleRecord[]).concat(target);
      for (const record of records) {
        await forgetRecentLocalFsHandle(record);
        // The app's search index holds the folder's words; it goes with the folder's place in the list.
        if (record.desktopRootPath) {
          await forgetVaultIndex(record.desktopRootPath).catch(() => undefined);
          // Search by meaning lives beside the index; its stored choice goes with the folder too.
          vaultVectorSource.clear(record.desktopRootPath);
        }
      }
      await refreshRecentVaults();
    },
    [refreshRecentVaults],
  );

  const close = useCallback(async () => {
    pickerSequenceRef.current += 1;
    const session = beginVaultReadSession(null);
    try {
      await deleteLocalFsHandle();
      await refreshRecentVaults();
    } finally {
      if (mountedRef.current && vaultReadSessionRef.current === session) {
        setState(emptyState(isSupported() ? 'idle' : 'unsupported'));
      }
    }
  }, [beginVaultReadSession, refreshRecentVaults, mountedRef, pickerSequenceRef, setState, vaultReadSessionRef]);

  // Once on mount: try to restore the handle from IDB, and switch to 'unsupported' when the
  // browser lacks FSA (starting from 'idle' keeps SSR consistent).
  useEffect(() => {
    if (!isSupported()) {
      setState((s) => ({ ...s, status: 'unsupported' }));
      setRestoreAttempted(true);
      return;
    }
    let cancelled = false;
    let session = vaultReadSessionRef.current;
    const pickerSequence = pickerSequenceRef.current;
    const isCurrent = () => !cancelled && mountedRef.current && vaultReadSessionRef.current === session &&
      pickerSequenceRef.current === pickerSequence;
    (async () => {
      /*
       * Whatever happens, this must end: `RootEntryPage` holds a boot frame until
       * `restoreAttempted` turns true, so the flag is set in `finally` and a failure carries
       * `access-failed` (the code the first-run screen already turns into a sentence).
       */
      const record = await getLocalFsHandle();
      if (!isCurrent()) return;
      // Read the list here, not via `refreshRecentVaults`: the decision below needs the value.
      const recent = await listRecentLocalFsHandles();
      if (isCurrent()) {
        setRecentVaults(recent);
        setStoredVaultRecord(record ?? null);
      }
      if (!record) {
        return;
      }
      if (!isCurrent()) return;
      /*
       * Two or more existing folders means the app asks instead of guessing; the count alone decides. Returning early
       * leaves `status` 'idle' with the stored record untouched; `close()` would delete the `current` record.
       */
      const resolutions = await Promise.all(recent.map(tauriVaultRecordResolves));
      if (!isCurrent()) return;
      if (resolutions.filter((resolution) => resolution !== 'missing').length >= 2) {
        setAwaitingVaultChoice(true);
        return;
      }
      const storedHandle = record.handle;
      session = beginVaultReadSession(storedHandle);
      const permission = await verifyRead(storedHandle, false);
      if (!isCurrent()) return;
      if (permission === 'granted') {
        const resolution = await tauriVaultRecordResolves(record);
        if (!isCurrent()) return;
        if (resolution !== 'ok') {
          if (isCurrent()) {
            setState({
              status: 'error',
              handle: storedHandle,
              manifest: null,
              agentConfigStatus: null,
              agentActivityStatus: emptyAgentActivityStatus(),
              agentActivityLog: [],
              acpWorkReceipts: [],
              mapAnalysisRecord: ABSENT_MAP_ANALYSIS_RECORD,
              fileHandles: new Map(),
              imageHandles: new Map(),
    sourceHandles: new Map(),
              errorMessage: null,
              errorCode: resolution === 'grant-needed' ? 'grant-needed' : 'path-missing',
              lastLoadedAt: null,
              manifestHandle: null,
              partialTotal: 0,
            });
          }
          return;
        }
        /*
         * Stamped only once the folder answers, so a missing folder keeps its real last use. Not
         * awaited: an extra await delays the vault past the map's `?edit=` deeplink consumption.
         */
        void touchLocalFsHandle();
        const resolvedHandle = await resolveVaultHandle(storedHandle);
        if (!isCurrent()) return;
        session.handle = resolvedHandle.handle;
        setOpenedInsidePickedFolder(resolvedHandle.redirectedFrom);
        if (resolvedHandle.redirectedFrom) {
          const now = Date.now();
          await putLocalFsHandle({
            ...record,
            id: CURRENT_LOCAL_FS_HANDLE_ID,
            handle: resolvedHandle.handle,
            name: resolvedHandle.handle.name,
            desktopRootPath:
              getTauriVaultRootPath(resolvedHandle.handle) ?? record.desktopRootPath,
            lastAccessedAt: now,
          });
          if (!isCurrent()) return;
          await refreshRecentVaults();
          if (!isCurrent()) return;
        }
        await load(resolvedHandle.handle);
      } else {
        setState({
          status: 'permission-needed',
          handle: storedHandle,
          manifest: null,
          agentConfigStatus: null,
          agentActivityStatus: emptyAgentActivityStatus(),
          agentActivityLog: [],
          acpWorkReceipts: [],
          mapAnalysisRecord: ABSENT_MAP_ANALYSIS_RECORD,
          fileHandles: new Map(),
          imageHandles: new Map(),
    sourceHandles: new Map(),
          errorMessage: null,
          errorCode: null,
          lastLoadedAt: null,
          manifestHandle: null,
          partialTotal: 0,
        });
      }
    })()
      .catch((error: unknown) => {
        if (!isCurrent()) return;
        /*
         * A vanished folder on the web arrives as a `NotFoundError` from the File System Access API;
         * read it so both runtimes report `path-missing` instead of `access-failed`.
         */
        const missing = isMissingFolderError(error);
        setState({
          status: 'error',
          handle: null,
          manifest: null,
          agentConfigStatus: null,
          agentActivityStatus: emptyAgentActivityStatus(),
          agentActivityLog: [],
          acpWorkReceipts: [],
          mapAnalysisRecord: ABSENT_MAP_ANALYSIS_RECORD,
          fileHandles: new Map(),
          imageHandles: new Map(),
    sourceHandles: new Map(),
          // `path-missing` deliberately carries no cause string: the screen owns that sentence.
          errorMessage: missing ? null : error instanceof Error ? error.message : String(error),
          // Every path that can meet a protected folder classifies the same way; otherwise the app
          // says different things about one fact depending on how the person arrived at it.
          errorCode:
            classifyVaultAccessError(error) === 'permission-denied'
              ? 'permission-denied'
              : missing
                ? 'path-missing'
                : 'access-failed',
          lastLoadedAt: null,
          manifestHandle: null,
          partialTotal: 0,
        });
      })
      .finally(() => {
        if (!cancelled) setRestoreAttempted(true);
      });
    return () => {
      cancelled = true;
    };
  }, [beginVaultReadSession, load, refreshRecentVaults, mountedRef, pickerSequenceRef, setAwaitingVaultChoice, setState, vaultReadSessionRef]);

  return {
    restoreAttempted,
    storedVaultRecord,
    openedInsidePickedFolder,
    setOpenedInsidePickedFolder,
    recentVaults,
    open,
    openRecent,
    forgetRecent,
    close,
  };
}
