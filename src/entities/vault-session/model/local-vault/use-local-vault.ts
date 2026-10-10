'use client';

import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { useLatestRef } from '@/shared/lib/use-latest-ref';
import { countVaultContents } from '@/shared/lib/vault-shape';
import {
  buildLocalManifestWithEntries,
  rebuildLocalManifestIncremental,
  computeLocalVaultFingerprintWithStamps,
  type VaultStampIndex,
  type BuiltVaultEntry,
  type LocalVaultBuild,
  type VaultBuildObserver,
  type VaultManifest,
} from '@/entities/docs-vault';
import { recordLocalFsHandleContents, verifyHandlePermission } from '@/entities/local-fs-handle';
import { isTauriVaultRuntime } from '@/shared/lib/tauri-vault-fs';
import { classifyVaultAccessError } from '../classify-vault-access-error';
import { toErrorMessage } from '@/shared/lib/error-message';
import { codedFailure } from '@/shared/lib/failure-code';
import { AGENT_ACTIVITY_STALE_AFTER_MS, emptyAgentActivityStatus } from '../agent-activity-status';
import { createAdaptivePoller, type PollCadenceConfig } from './poll-cadence';
import { createVaultLoadProgressStore } from '../vault-load-progress';
import { createVaultArrivalStore } from '../vault-arrival';
import {
  comparableAgentActivityStatus,
  structurallyEqualStatus,
  readVaultSidecarStatuses,
} from './vault-sidecars';
import {
  FULL_STARTER_SHAPE,
  writeVaultStarter,
  type VaultOpenOptions,
  type VaultOpenResult,
} from './vault-starter';
import { verifyRead } from './vault-handle';
import { emptyState, withArrivedPart, type State, type VaultSessionCore } from './vault-state';
import { useVaultChoice } from './use-vault-choice';
import { useVaultDocWrites } from './use-vault-doc-writes';

/** Minimum interval (ms) between auto-refreshes when the tab regains focus.
 *  Without the throttle every quick trip to an IDE and back makes the UI flash. */
const AUTO_REFRESH_DEBOUNCE_MS = 2000;

/** Network drives, a watcher that failed to start, and events the OS dropped. */
const APP_SAFETY_POLL: PollCadenceConfig = { burstMs: 60_000, idleMs: 60_000, burstWindowMs: 0 };
const HEARTBEAT_STALE_MARGIN_MS = 1000;

/**
 * @internal — mount through `LocalVaultProvider`, read through `useLocalVault()`. One mounted
 * instance keeps IDB rehydration, fingerprint rescans and FS reads from running per consumer.
 */
export function useLocalVaultInternal() {
  // Start 'idle' on both server and client; a mount effect switches to 'unsupported' when FSA
  // is missing, so hydration matches.
  const [state, setState] = useState<State>(() => emptyState('idle'));
  const stateRef = useLatestRef(state);
  /**
   * The launch stopped at the chooser on purpose: two or more folders are known and the app
   * will not guess. Not a failure; the docs surface needs it because 'idle' alone would land on the sample.
   */
  const [awaitingVaultChoice, setAwaitingVaultChoice] = useState(false);

  /** Fingerprint of the last successful build — the comparison that lets auto-refresh skip. */
  const lastFingerprintRef = useRef<string | null>(null);

  /** Reusable entries of the last build plus their handle, for incremental rebuilds. A ref, no re-render. */
  const lastBuildRef = useRef<{
    handle: FileSystemDirectoryHandle;
    entries: BuiltVaultEntry[];
  } | null>(null);
  const vaultReadSessionRef = useRef<{ handle: FileSystemDirectoryHandle | null }>({ handle: null });
  const loadSequenceRef = useRef(0);
  const pickerSequenceRef = useRef(0);
  const mountedRef = useRef(true);
  const [loadProgressStore] = useState(createVaultLoadProgressStore);
  const [arrivalStore] = useState(createVaultArrivalStore<VaultManifest>);
  const arrivingTotal = state.status === 'loading' ? state.partialTotal : 0;
  useEffect(() => {
    if (arrivingTotal === 0) arrivalStore.set(null);
  }, [arrivalStore, arrivingTotal]);
  const beginVaultReadSession = useCallback((handle: FileSystemDirectoryHandle | null) => {
    const session = { handle };
    vaultReadSessionRef.current = session;
    loadProgressStore.set(null);
    if (!handle || lastBuildRef.current?.handle !== handle) {
      lastBuildRef.current = null;
      lastFingerprintRef.current = null;
    }
    return session;
  }, [loadProgressStore]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      pickerSequenceRef.current += 1;
      beginVaultReadSession(null);
    };
  }, [beginVaultReadSession]);

  const load = useCallback(async (
    handle: FileSystemDirectoryHandle,
    options: VaultOpenOptions = {},
    nativeStamps: VaultStampIndex | null = null,
  ): Promise<Omit<VaultOpenResult, 'opened'> | null> => {
    const session = vaultReadSessionRef.current;
    if (!mountedRef.current || session.handle !== handle) return null;
    const sequence = ++loadSequenceRef.current;
    const isCurrent = () => mountedRef.current && vaultReadSessionRef.current === session &&
      session.handle === handle && loadSequenceRef.current === sequence;
    let settled = false;
    let arrivedPart = false;
    // Any folder actually being opened ends the choosing state, whichever door it came
    // through — the chooser row, the picker, or a restore. Clearing it here rather than in
    // each caller is why a new door cannot forget to.
    setAwaitingVaultChoice(false);
    setState((s) => {
      const cleared = { ...s, handle, errorMessage: null, errorCode: null, partialTotal: 0 };
      /*
       * Re-reading an already open folder is not opening one: keep the frame on screen and swap
       * in the new manifest. A different or unloaded folder still shows `loading`.
       */
      return s.status === 'loaded' && s.handle === handle ? cleared : { ...cleared, status: 'loading' };
    });
    try {
      // Same handle as the previous build: rebuild incrementally; otherwise (or on failure) build in full.
      const reuse =
        lastBuildRef.current && lastBuildRef.current.handle === handle
          ? lastBuildRef.current.entries
          : null;
      const arriving: VaultBuildObserver | undefined =
        stateRef.current.manifestHandle === handle
          ? undefined
          : {
              onProgress: (progress) => {
                if (!settled && isCurrent()) loadProgressStore.set(progress);
              },
              onPartial: (build, progress) => {
                if (settled || !isCurrent()) return;
                arrivedPart = true;
                arrivalStore.set(build.manifest);
                setState((s) => withArrivedPart(s, progress.total));
              },
            };
      let result: { build: LocalVaultBuild; entries: BuiltVaultEntry[] };
      if (reuse) {
        try {
          // Use the stamps `refresh()` just walked for, when it has them; otherwise the
          // incremental path fetches them itself (first load, other entry points).
          result = await rebuildLocalManifestIncremental(handle, reuse, nativeStamps);
        } catch {
          if (!isCurrent()) return null;
          result = await buildLocalManifestWithEntries(handle, arriving);
        }
      } else {
        result = await buildLocalManifestWithEntries(handle, arriving);
      }
      if (!isCurrent()) return null;
      /*
       * A creation door's starter is written here, as part of the open, so the map is never drawn
       * empty. Only into a folder with no documents; a failure is handed back, not thrown.
       */
      let starterWritten = 0;
      let starterError: unknown = null;
      if (options.starter && result.build.manifest.docs.length === 0) {
        try {
          const permission = await verifyHandlePermission(handle, 'readwrite', { ask: true });
          if (!isCurrent()) return null;
          if (permission !== 'granted') {
            throw codedFailure('permission-denied');
          }
          const written = await writeVaultStarter(
            handle,
            options.starter.locale,
            options.starter.shape ?? FULL_STARTER_SHAPE,
            result.build.fileHandles,
          );
          starterWritten = written.created;
          starterError = written.firstFailure;
        } catch (error) {
          starterError = error;
        }
        if (!isCurrent()) return null;
        // Re-read what actually landed, a partial starter included: the screen shows the disk.
        result = await buildLocalManifestWithEntries(handle);
        if (!isCurrent()) return null;
      }
      const { build, entries } = result;
      const { manifest, fileHandles, imageHandles, sourceHandles, fingerprint } = build;
      const { agentConfigStatus, agentActivityStatus, agentActivityLog, acpWorkReceipts } =
        await readVaultSidecarStatuses(handle);
      if (!isCurrent()) return null;
      lastFingerprintRef.current = fingerprint;
      lastBuildRef.current = { handle, entries };
      settled = true;
      loadProgressStore.set(null);
      const loaded: State = {
        status: 'loaded',
        handle,
        manifest,
        agentConfigStatus,
        agentActivityStatus,
        agentActivityLog,
        acpWorkReceipts,
        fileHandles,
        imageHandles,
        sourceHandles,
        errorMessage: null,
        errorCode: null,
        lastLoadedAt: Date.now(),
        manifestHandle: handle,
        partialTotal: 0,
      };
      if (arrivedPart) startTransition(() => setState(loaded));
      else setState(loaded);
      /*
       * The chooser's row facts are written here, where the walk was already paid for. Own
       * try/catch: a failure must not turn a loaded folder into an error, and a sync throw
       * (partial module mock) never becomes a rejection.
       */
      try {
        /*
         * Never awaited: `load()` resolving means "the manifest is live". Awaiting here opens a
         * window in which a rename is committed but `appTouchedSlugsRef` is still empty.
         */
        void recordLocalFsHandleContents(countVaultContents(manifest.docs)).catch(() => {});
      } catch {
        /* The counts stay absent; the row says so. */
      }
      return { starterWritten, starterError };
    } catch (err) {
      if (!isCurrent()) return null;
      lastBuildRef.current = null;
      lastFingerprintRef.current = null;
      settled = true;
      loadProgressStore.set(null);
      // `toErrorMessage` keeps the cause string (Tauri rejects with a string); empty stays null
      // so the picker's `errorFallback` fills it.
      setState({
        status: 'error',
        handle,
        manifest: null,
        agentConfigStatus: null,
        agentActivityStatus: emptyAgentActivityStatus(),
        agentActivityLog: [],
        acpWorkReceipts: [],
        fileHandles: new Map(),
        imageHandles: new Map(),
    sourceHandles: new Map(),
        errorMessage: toErrorMessage(err),
        // A refusal by the operating system is not the same event as a broken folder, and sending
        // somebody to System Settings to fix a folder that is simply gone would be worse than vague.
        errorCode:
          classifyVaultAccessError(err) === 'permission-denied' ? 'permission-denied' : 'access-failed',
        lastLoadedAt: null,
        manifestHandle: null,
        partialTotal: 0,
      });
      return null;
    }
  }, [arrivalStore, loadProgressStore, stateRef]);

  /** User-initiated refresh: an unchanged fingerprint skips the rebuild but updates `lastLoadedAt`. */
  const refresh = useCallback(async () => {
    const handle = stateRef.current.handle;
    const session = vaultReadSessionRef.current;
    const isCurrent = () => mountedRef.current && vaultReadSessionRef.current === session && session.handle === handle;
    if (!handle || !isCurrent()) return;
    let nativeStamps: VaultStampIndex | null = null;
    try {
      // Take the fingerprint and its stamps together so the incremental rebuild walks once.
      const { fingerprint: fp, nativeStamps: stamps } =
        await computeLocalVaultFingerprintWithStamps(handle);
      if (!isCurrent()) return;
      if (fp === lastFingerprintRef.current) {
        const sidecars = await readVaultSidecarStatuses(handle);
        if (!isCurrent()) return;
        setState((s) => isCurrent() ? { ...s, ...sidecars, lastLoadedAt: Date.now() } : s);
        return;
      }
      nativeStamps = stamps;
    } catch {
      /* Fingerprint failed — fall back safely to a full rebuild. */
    }
    if (isCurrent()) await load(handle, {}, nativeStamps);
  }, [stateRef, load]);

  // Refresh when the tab regains focus; the fingerprint check skips unchanged vaults.
  const autoRefreshRef = useRef<{
    lastAt: number;
    timer: ReturnType<typeof setTimeout> | null;
  }>({ lastAt: 0, timer: null });
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);
  // Returns true when a change was detected (a reload was triggered) — drives
  // the adaptive poll cadence (burst after a change, idle when quiet).
  const loadedHandle = state.status === 'loaded' ? state.handle : null;
  const syncWithDisk = useCallback(async (): Promise<boolean> => {
    if (!loadedHandle) return false;
    const handle = loadedHandle;
    const session = vaultReadSessionRef.current;
    const isCurrent = () => mountedRef.current && vaultReadSessionRef.current === session && session.handle === handle;
    if (!isCurrent()) return false;
    let nativeStamps: VaultStampIndex | null = null;
    try {
      const { fingerprint: fp, nativeStamps: stamps } =
        await computeLocalVaultFingerprintWithStamps(handle);
      if (!isCurrent()) return false;
      nativeStamps = stamps;
      if (fp === lastFingerprintRef.current) {
        const sidecars = await readVaultSidecarStatuses(handle);
        if (!isCurrent()) return false;
        // State changes only when a sidecar did, or every check re-renders the whole app.
        setState((s) => {
          if (!isCurrent()) return s;
          const same =
            structurallyEqualStatus(s.agentConfigStatus, sidecars.agentConfigStatus) &&
            structurallyEqualStatus(
              comparableAgentActivityStatus(s.agentActivityStatus),
              comparableAgentActivityStatus(sidecars.agentActivityStatus),
            ) &&
            // The log is read capped at 50 entries, so an append can keep its length.
            s.agentActivityLog.length === sidecars.agentActivityLog.length &&
            structurallyEqualStatus(s.agentActivityLog.at(-1), sidecars.agentActivityLog.at(-1)) &&
            s.acpWorkReceipts.length === sidecars.acpWorkReceipts.length &&
            s.acpWorkReceipts.at(-1)?.updatedAt === sidecars.acpWorkReceipts.at(-1)?.updatedAt;
          return same ? s : { ...s, ...sidecars, lastLoadedAt: Date.now() };
        });
        return false;
      }
    } catch {
      /* Ignore a fingerprint failure — fall back safely to a full rebuild. */
    }
    if (!isCurrent()) return false;
    // Not awaited: the poll's cadence counts only its own check.
    void loadRef.current(handle, {}, nativeStamps);
    return true;
  }, [loadedHandle]);
  useEffect(() => {
    if (!loadedHandle) return;
    const tracker = autoRefreshRef.current;
    const fire = () => {
      const now = Date.now();
      const last = tracker.lastAt;
      if (now - last < AUTO_REFRESH_DEBOUNCE_MS) {
        if (tracker.timer) clearTimeout(tracker.timer);
        tracker.timer = setTimeout(() => {
          tracker.lastAt = Date.now();
          void syncWithDisk();
        }, AUTO_REFRESH_DEBOUNCE_MS - (now - last));
        return;
      }
      tracker.lastAt = now;
      void syncWithDisk();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') fire();
    };
    window.addEventListener('focus', fire);
    document.addEventListener('visibilitychange', onVisibility);

    // The web has no folder events, so it polls adaptively (`poll-cadence.ts`). The app's
    // watcher reports changes at once; its slow poll catches what a watcher cannot see.
    const poller = createAdaptivePoller({
      poll: syncWithDisk,
      config: isTauriVaultRuntime() ? APP_SAFETY_POLL : undefined,
    });
    const onVisibilityForPoll = () => {
      if (document.visibilityState === 'visible') poller.start();
      else poller.stop();
    };
    if (document.visibilityState === 'visible') poller.start();
    document.addEventListener('visibilitychange', onVisibilityForPoll);

    return () => {
      window.removeEventListener('focus', fire);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('visibilitychange', onVisibilityForPoll);
      poller.stop();
      if (tracker.timer) {
        clearTimeout(tracker.timer);
        tracker.timer = null;
      }
    };
  }, [loadedHandle, syncWithDisk]);

  const freshHeartbeatAt = state.agentActivityStatus.stale
    ? null
    : (state.agentActivityStatus.heartbeat?.updatedAt ?? null);
  useEffect(() => {
    if (!freshHeartbeatAt) return;
    const staleAt =
      Date.parse(freshHeartbeatAt) + AGENT_ACTIVITY_STALE_AFTER_MS + HEARTBEAT_STALE_MARGIN_MS;
    const timer = setTimeout(() => void syncWithDisk(), Math.max(0, staleAt - Date.now()));
    return () => clearTimeout(timer);
  }, [freshHeartbeatAt, syncWithDisk]);

  const requestPermission = useCallback(async () => {
    const handle = stateRef.current.handle;
    const session = vaultReadSessionRef.current;
    const isCurrent = () => mountedRef.current && vaultReadSessionRef.current === session && session.handle === handle;
    if (!handle || !isCurrent()) return;
    const result = await verifyRead(handle, true);
    if (!isCurrent()) return;
    if (result === 'granted') {
      await load(handle);
    } else {
      setState((s) => ({ ...s, status: 'permission-needed' }));
    }
  }, [stateRef, load]);

  const core: VaultSessionCore = {
    setState,
    stateRef,
    setAwaitingVaultChoice,
    vaultReadSessionRef,
    pickerSequenceRef,
    mountedRef,
    beginVaultReadSession,
    load,
  };
  const {
    selfEditTimestamps,
    markSelfWrite,
    unmarkSelfWrite,
    consumeSelfWrittenSlugs,
    consumeReportedConflicts,
    saveDoc,
    createDoc,
    deleteDoc,
    renameDoc,
    scaffoldOntology,
    ensureAgentConfigs,
    updateFrontmatter,
    reclassifyDoc,
  } = useVaultDocWrites(core, state.handle);
  const {
    restoreAttempted,
    storedVaultRecord,
    openedInsidePickedFolder,
    setOpenedInsidePickedFolder,
    recentVaults,
    open,
    openRecent,
    forgetRecent,
    close,
  } = useVaultChoice(core);

  return {
    status: state.status,
    handle: state.handle,
    manifest: state.manifest,
    agentConfigStatus: state.agentConfigStatus,
    agentActivityStatus: state.agentActivityStatus,
    agentActivityLog: state.agentActivityLog,
    acpWorkReceipts: state.acpWorkReceipts,
    recentVaults,
    awaitingVaultChoice,
    storedVaultRecord,
    fileHandles: state.fileHandles,
    imageHandles: state.imageHandles,
    sourceHandles: state.sourceHandles,
    errorMessage: state.errorMessage,
    errorCode: state.errorCode,
    lastLoadedAt: state.lastLoadedAt,
    /**
     * Is this a re-read of the same folder (save, focus rescan)? False while switching folders,
     * so the previous folder is never drawn as the new one.
     */
    isReloadingSameVault:
      state.status === 'loading' &&
      state.manifest !== null &&
      state.manifestHandle === state.handle,
    partialTotal: arrivingTotal,
    loadProgressStore,
    arrivalStore,
    restoreAttempted,
    /** The folder the person picked, when the map inside it was opened instead. Screens must say so. */
    openedInsidePickedFolder,
    /** Clears the one-time substitution notice once read. */
    dismissOpenedInsideNotice: () => setOpenedInsidePickedFolder(null),
    // Derived from state to stay SSR-consistent (avoiding an `isSupported()` call in the lazy
    // initializer). The switch to 'unsupported' happens in a mount effect.
    isSupported: state.status !== 'unsupported',
    open,
    openRecent,
    forgetRecent,
    close,
    refresh,
    syncWithDisk,
    requestPermission,
    saveDoc,
    createDoc,
    deleteDoc,
    renameDoc,
    scaffoldOntology,
    ensureAgentConfigs,
    updateFrontmatter,
    reclassifyDoc,
    markSelfWrite,
    unmarkSelfWrite,
    consumeSelfWrittenSlugs,
    consumeReportedConflicts,
    selfEditTimestamps,
  };
}
