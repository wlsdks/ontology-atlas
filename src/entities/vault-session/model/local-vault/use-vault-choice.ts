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
  getTauriVaultRootPath,
  isTauriVaultRuntime,
  pickTauriVaultDirectory,
  vaultRootRejectionReason,
} from '@/shared/lib/tauri-vault-fs';
import { classifyVaultAccessError, isMissingFolderError } from '../classify-vault-access-error';
import { toErrorMessage } from '@/shared/lib/error-message';
import { isPickerAbort } from '@/shared/lib/picker-abort';
import { emptyAgentActivityStatus } from '../agent-activity-status';
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
   * The stored `current` record as read at boot - **which folder the last session had
   * open**, whether or not it was then loaded.
   *
   * The chooser needs it to mark one row "last open", and that has to be a stored fact
   * rather than an inference. Taking the top of the recent list instead would be right only
   * for as long as "most recently accessed" and "was open last" agree, and they stop
   * agreeing the moment a `touch` or a failed open reorders the list.
   */
  const [storedVaultRecord, setStoredVaultRecord] = useState<LocalFsHandleRecord | null>(
    null,
  );
  /**
   * Set when "open a folder" opened the map **inside** the folder that was picked.
   *
   * ⚠️ Exists so the screen can say so. Quietly opening a different folder from the one a person
   * chose teaches them the product does not do what they asked, even when the substitution is the
   * helpful one. Holds the path they actually picked; `null` means nothing was substituted.
   */
  const [openedInsidePickedFolder, setOpenedInsidePickedFolder] = useState<string | null>(null);
  const [recentVaults, setRecentVaults] = useState<LocalFsHandleRecord[]>([]);

  const refreshRecentVaults = useCallback(async () => {
    setRecentVaults(await listRecentLocalFsHandles());
  }, []);

  /**
   * Picks a folder and opens it. `options.starter` is a creation door's request: when the picked
   * folder holds no documents, the starter is written before the folder is first shown. The result
   * says whether the folder opened and whether its starter landed, because the screen that pressed
   * the door is usually gone by the time this settles.
   */
  const open = useCallback(async (options: VaultOpenOptions = {}): Promise<VaultOpenResult> => {
    if (!isSupported()) {
      setState(emptyState('unsupported'));
      return NOT_OPENED;
    }
    // Cancelling the native or browser picker is not a state change: the exact contract from
    // just before the picker opened — permission-needed, error, idle, loaded — must be
    // restored whole. Inferring 'loaded' from the mere presence of a `handle` makes a cancel
    // during permission-needed wake a spurious auto-refresh that surfaces a raw OS error
    // from a stale path.
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
              showDirectoryPicker: (opts?: {
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
       * ⚠️ **A person who picks their project means their map** (owner, 2026-08-24). Since the map
       * moved to `<project>/atlas`, two folders became plausible to pick, and this path took
       * whatever it was handed — so picking the project root read the entire source tree as a vault
       * and buried the map that was right there. See `resolve-picked-vault-folder.ts` for why the
       * rule is narrow and why it is never silent.
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
       * ⚠️ **The order is the contract** (caught in review, 2026-08-16).
       *
       * The recent list used to be updated **first**. At that moment "this computer has
       * never opened a vault" becomes false, and that single value **simultaneously removes**
       * the first-run card, the "switch to my data" tile, and the first-run readout from
       * the screen.
       *
       * So when the read on the very next line failed, the surface that would have said so
       * was already gone — the user saw a silent sample map. Add to the list only after
       * success.
       */
      const loaded = await load(openHandle, options);
      if (!isCurrent()) return NOT_OPENED;
      await refreshRecentVaults();
      if (!isCurrent()) return NOT_OPENED;
      return loaded ? { opened: true, ...loaded } : NOT_OPENED;
    } catch (err) {
      if (!isCurrent()) return NOT_OPENED;
      // A cancel is not a failure — restore the state from just before the picker (see `isPickerAbort`).
      if (isPickerAbort(err)) {
        setState(previousState);
        return NOT_OPENED;
      }
      // A "cannot be a vault root" rejection is handled differently from a failure. Leaking
      // the cause string to the screen would show the user `vault-root-rejected:filesystem-root`,
      // and "please try again" is false guidance when every retry gives the same result.
      const rejection = vaultRootRejectionReason(err);
      if (rejection) {
        setState((s) => ({
          ...s,
          status: 'error',
          errorMessage: null,
          errorCode: 'root-rejected',
        }));
        return NOT_OPENED;
      }
      // Same reason the hardcoded Korean "Failed to open folder" was removed — null lets
      // LocalVaultPicker fall back to `t('errorFallback')`.
      setState((s) => ({
        ...s,
        status: 'error',
        errorMessage: toErrorMessage(err),
        errorCode:
          classifyVaultAccessError(err) === 'permission-denied'
            ? 'permission-denied'
            : 'access-failed',
      }));
      return NOT_OPENED;
    }
  }, [beginVaultReadSession, load, refreshRecentVaults, stateRef, mountedRef, pickerSequenceRef, setState, vaultReadSessionRef]);

  /** Reopens a known folder; `options.starter` as in `open`. */
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
        // Desktop-only path: the stored absolute path *is* the handle, so it reopens with no
        // FSA picker. But if the folder moved or was deleted since the last session, building
        // the manifest throws a raw io error — preflight first so it classifies as a readable
        // 'path-missing' and prompts "choose the folder again". A present-but-ungranted vault
        // (first launch after the access-scope update) is 'grant-needed', not a loss.
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
      } catch (err) {
        if (!isCurrent()) return NOT_OPENED;
        // `toErrorMessage` — a Tauri `invoke` rejects with `Err(String)` as a plain string.
        setState((s) => ({
          ...s,
          status: 'error',
          errorMessage: toErrorMessage(err),
          errorCode:
            classifyVaultAccessError(err) === 'permission-denied'
              ? 'permission-denied'
              : 'access-failed',
        }));
        return NOT_OPENED;
      }
    },
    [beginVaultReadSession, load, refreshRecentVaults, mountedRef, pickerSequenceRef, setState, vaultReadSessionRef],
  );

  /**
   * Stops listing one folder, or several, as a known folder. The folders themselves are never
   * touched: this is the recent list only.
   *
   * Several at once is the launch chooser's "forget all" for folders that no longer exist
   * (2026-09-26): every write goes through the store's queue first and the list is read back once,
   * so it redraws once instead of shrinking a row at a time.
   */
  const forgetRecent = useCallback(
    async (target: LocalFsHandleRecord | readonly LocalFsHandleRecord[]) => {
      const records = ([] as LocalFsHandleRecord[]).concat(target);
      for (const record of records) await forgetRecentLocalFsHandle(record);
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
       * ⚠️ **Whatever happens, this must end** (installed app, 2026-08-24).
       *
       * `RootEntryPage` holds a neutral boot frame until `restoreAttempted` turns true. This body
       * had no `catch` and no `finally`, so any rejection along the way left that flag false and
       * the app sat on 「moving to the local docs picker」 **forever** — no error, no way out, and
       * the person had touched nothing.
       *
       * It is not hypothetical. A vault under a macOS-protected folder (Downloads, Documents,
       * Desktop) whose access prompt was dismissed makes the Tauri read fail, and that is exactly
       * what happened here. Note the asymmetry it exposed: a folder that is **gone** already
       * reported honestly (`path-missing` → 「that folder could not be found, choose another」),
       * while a folder that is **there but unreadable** reported nothing at all. The second is the
       * more common case and it had the worse answer.
       *
       * So the flag is set in `finally`, and a failure carries `access-failed` — the code the
       * first-run screen already turns into a sentence with somewhere to go.
       */
      const record = await getLocalFsHandle();
      if (!isCurrent()) return;
      /*
       * Read the list here rather than through `refreshRecentVaults`, because the decision
       * below needs the value and not just the state update.
       */
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
       * ⚠️ **Two or more known folders means the app stops guessing and asks.**
       *
       * Owner, on relaunching the installed app (2026-09-13): once you have set the app up,
       * relaunching always drops you in the same place, and that is the problem — it would
       * be different if the choice came first every time and you picked your way in, the
       * way you pick a game character.
       *
       * The count decides, and **nothing else does**. There is deliberately no preference
       * for "show the chooser on launch": a setting is one more control nobody finds, and
       * being unable to find the control is the defect being fixed here, not a detail of
       * it. The release valve is the list itself — forgetting a folder on the chooser drops
       * the count back to one and the next launch resumes directly. The person changes the
       * behaviour by changing the list, in the same place they are already looking.
       *
       * One folder is not asked about: a chooser there is a toll on every launch for a
       * screen with one button.
       *
       * Returning early leaves `status` at 'idle' with the stored record **untouched** —
       * `shouldShowDesktopVaultWelcome` already renders the folder screen in that state, so
       * the chooser this reveals is the one that was always built. `close()` is the wrong
       * tool here: it deletes the `current` record, which would throw away the answer to
       * "which folder was I in last".
       */
      if (recent.length >= 2) {
        setAwaitingVaultChoice(true);
        return;
      }
      const storedHandle = record.handle;
      session = beginVaultReadSession(storedHandle);
      /*
       * ⚠️ **Not awaited, and the reason is measured.** This and
       * `recordLocalFsHandleContents` both read-modify-write the single recent-list key, and
       * the launch rule is decided by how many entries that list holds - so a dropped entry
       * silently turns the chooser off. Awaiting here was the first attempt at that, and it
       * cost more than it bought: the extra await point pushed the vault's arrival past the
       * map's consumption of a `?edit=` deeplink, so the relation contextual editor never
       * opened at all and `tests/e2e/a11y-vault-backed.spec.ts` reported the state as
       * **unmeasured** (CI shard chromium 1/3, 2026-09-13; bisected by reverting this one
       * line, which took the spec from red to 44.9s green, matching main).
       *
       * The interleave is fixed where it belongs instead: `store.ts` runs every recent-list
       * write through one queue, so no caller has to wait for a cache write to keep the list
       * intact. Second time in one day that adding an await to this file broke code whose
       * timing depended on it - the other being the rename verdict inside `load`.
       */
      void touchLocalFsHandle();
      const permission = await verifyRead(storedHandle, false);
      if (!isCurrent()) return;
      if (permission === 'granted') {
        // (Desktop) The common silent failure of auto-restore: the stored vault folder moved or
        // was deleted while the app was closed. Preflight first so it classifies as
        // 'path-missing' and the picker says the folder is gone and to choose again, instead of
        // a raw io error thrown from inside `load`.
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
         * ⚠️ **A folder that is gone must say so on the web too** (census, 2026-08-31). The desktop
         * preflights the stored absolute path and reports `path-missing`; a browser has no path to
         * preflight, so the folder's disappearance arrives only as a `NotFoundError` thrown out of
         * the File System Access API. That fell into `access-failed`, and its developer sentence
         * ("A requested file or directory could not be found…") was then printed verbatim on a
         * Korean screen. Reading the exception gives both runtimes one code for one fact.
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
