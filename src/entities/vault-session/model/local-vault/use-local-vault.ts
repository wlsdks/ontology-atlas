'use client';

import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { useLatestRef } from '@/shared/lib/use-latest-ref';
import { countVaultContents } from '@/shared/lib/vault-folder/vault-shape';
import {
  applyVaultChanges,
  buildLocalManifestWithEntries,
  rebuildLocalManifestIncremental,
  computeLocalVaultFingerprintWithStamps,
  type LocalVaultSnapshot,
  type VaultStampIndex,
  type VaultBuildObserver,
  type VaultManifest,
} from '@/entities/docs-vault';
import { recordLocalFsHandleContents, verifyHandlePermission } from '@/entities/local-fs-handle';
import type { VaultChangeBatch, VaultPathChange } from '@/shared/lib/vault-folder/vault-change-batch';
import { classifyVaultAccessError } from '../vault-opening/classify-vault-access-error';
import { toErrorMessage } from '@/shared/lib/failures/error-message';
import { codedFailure } from '@/shared/lib/failures/failure-code';
import { AGENT_ACTIVITY_STALE_AFTER_MS, emptyAgentActivityStatus } from '../agent-activity-status';
import { ABSENT_MAP_ANALYSIS_RECORD } from '@/shared/lib/vault-document/map-analysis-record';
import { createAdaptivePoller, type PollCadenceConfig } from './poll-cadence';
import { createVaultLoadProgressStore } from '../vault-opening/vault-load-progress';
import { createVaultArrivalStore } from '../vault-opening/vault-arrival';
import {
  comparableAgentActivityStatus,
  comparableMapAnalysisRecord,
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

/** Throttle: every quick trip to an IDE and back would otherwise flash the UI. */
const AUTO_REFRESH_DEBOUNCE_MS = 2000;

/** Network drives, a watcher that failed to start, and events the OS dropped. */
const SAFETY_POLL: PollCadenceConfig = { burstMs: 60_000, idleMs: 60_000, burstWindowMs: 0 };
const HEARTBEAT_STALE_MARGIN_MS = 1000;

/** @internal — mount through `LocalVaultProvider`, read through `useLocalVault()`; one instance keeps IDB rehydration, fingerprint rescans and FS reads from running per consumer. */
export function useLocalVaultInternal() {
  // Start 'idle' on both server and client, so hydration matches.
  const [state, setState] = useState<State>(() => emptyState('idle'));
  const stateRef = useLatestRef(state);
  /** The launch stopped at the chooser on purpose (two or more folders are known); not a failure, and 'idle' alone would land on the sample. */
  const [awaitingVaultChoice, setAwaitingVaultChoice] = useState(false);

  const lastFingerprintRef = useRef<string | null>(null);

  /** The last build, its entries and their handle, for incremental rebuilds and path deltas. A ref, no re-render. */
  const lastBuildRef = useRef<(LocalVaultSnapshot & { handle: FileSystemDirectoryHandle }) | null>(null);
  /** Loads not yet settled; a path delta waits for them so it patches what they commit. */
  const loadsInFlightRef = useRef(new Set<Promise<unknown>>());
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

  const runLoad = useCallback(async (
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
    // Any folder being opened ends the choosing state, whichever door it came through; clearing it here is why a new
    // door cannot forget to.
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
      let result: LocalVaultSnapshot;
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
      const { agentConfigStatus, agentActivityStatus, agentActivityLog, acpWorkReceipts, mapAnalysisRecord } =
        await readVaultSidecarStatuses(handle);
      if (!isCurrent()) return null;
      lastFingerprintRef.current = fingerprint;
      lastBuildRef.current = { handle, entries, build };
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
        mapAnalysisRecord,
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
    } catch (error) {
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
        mapAnalysisRecord: ABSENT_MAP_ANALYSIS_RECORD,
        fileHandles: new Map(),
        imageHandles: new Map(),
    sourceHandles: new Map(),
        errorMessage: toErrorMessage(error),
        // A refusal by the operating system is not the same event as a broken folder, and sending
        // somebody to System Settings to fix a folder that is simply gone would be worse than vague.
        errorCode:
          classifyVaultAccessError(error) === 'permission-denied' ? 'permission-denied' : 'access-failed',
        lastLoadedAt: null,
        manifestHandle: null,
        partialTotal: 0,
      });
      return null;
    }
  }, [arrivalStore, loadProgressStore, stateRef]);

  const load: typeof runLoad = useCallback((...args) => {
    const running = runLoad(...args);
    const inFlight = loadsInFlightRef.current;
    inFlight.add(running);
    const settle = () => inFlight.delete(running);
    running.then(settle, settle);
    return running;
  }, [runLoad]);

  const refresh = useCallback(async () => {
    const handle = stateRef.current.handle;
    const session = vaultReadSessionRef.current;
    const isCurrent = () => mountedRef.current && vaultReadSessionRef.current === session && session.handle === handle;
    if (!handle || !isCurrent()) return;
    let nativeStamps: VaultStampIndex | null = null;
    try {
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

  const autoRefreshRef = useRef<{
    lastAt: number;
    timer: ReturnType<typeof setTimeout> | null;
  }>({ lastAt: 0, timer: null });
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);
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
            s.acpWorkReceipts.at(-1)?.updatedAt === sidecars.acpWorkReceipts.at(-1)?.updatedAt &&
            structurallyEqualStatus(comparableMapAnalysisRecord(s.mapAnalysisRecord), comparableMapAnalysisRecord(sidecars.mapAnalysisRecord));
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
  /**
   * Applies one watcher batch on top of the last build (`applyVaultChanges`) after any load in flight settles; falls back to
   * `syncWithDisk` for a rescan. A load that starts meanwhile read the disk after these changes, so its result wins and the
   * delta is dropped, as is a batch watched for another folder than the one now loaded.
   */
  const applyChangeBatch = useCallback(async (
    watched: FileSystemDirectoryHandle,
    changes: readonly VaultPathChange[],
    rescan: boolean,
  ): Promise<void> => {
    if (!loadedHandle || watched !== loadedHandle) return;
    const handle = loadedHandle;
    const session = vaultReadSessionRef.current;
    const isSession = () => mountedRef.current && vaultReadSessionRef.current === session && session.handle === handle;
    while (loadsInFlightRef.current.size > 0) await Promise.allSettled([...loadsInFlightRef.current]);
    if (!isSession()) return;
    const last = lastBuildRef.current;
    if (rescan || !last || last.handle !== handle || stateRef.current.manifestHandle !== handle) {
      await syncWithDisk();
      return;
    }
    const sequence = loadSequenceRef.current;
    const isCurrent = () => isSession() && loadSequenceRef.current === sequence && lastBuildRef.current === last;
    const result = await applyVaultChanges(handle, last, changes).catch(() => ({ kind: 'rescan' as const }));
    if (!isCurrent()) return;
    if (result.kind === 'rescan') {
      await syncWithDisk();
      return;
    }
    const sidecars = result.sidecarsTouched ? await readVaultSidecarStatuses(handle) : null;
    if (!isCurrent()) return;
    if (result.kind === 'unchanged') {
      if (sidecars) setState((s) => (isCurrent() ? { ...s, ...sidecars, lastLoadedAt: Date.now() } : s));
      return;
    }
    const { build, entries } = result.snapshot;
    lastFingerprintRef.current = build.fingerprint;
    lastBuildRef.current = { handle, entries, build };
    setState((s) => s.handle !== handle ? s : {
      ...s,
      ...(sidecars ?? {}),
      manifest: build.manifest,
      fileHandles: build.fileHandles,
      imageHandles: build.imageHandles,
      sourceHandles: build.sourceHandles,
      lastLoadedAt: Date.now(),
    });
    if (build.manifest.docs.length !== last.build.manifest.docs.length) {
      try {
        void recordLocalFsHandleContents(countVaultContents(build.manifest.docs)).catch(() => {});
      } catch {
        /* The chooser's counts stay as they were. */
      }
    }
  }, [loadedHandle, stateRef, syncWithDisk]);

  /**
   * Batches that arrive while one is applied merge into the next, so deltas never overlap. Only
   * batches for one folder merge; a batch for another replaces what was queued.
   */
  const queuedChangesRef = useRef<{
    handle: FileSystemDirectoryHandle;
    changes: Map<string, VaultPathChange>;
    rescan: boolean;
  } | null>(null);
  const drainingChangesRef = useRef(false);
  const applyChangeBatchRef = useLatestRef(applyChangeBatch);
  const applyVaultChangeBatch = useCallback((batch: VaultChangeBatch, watched: FileSystemDirectoryHandle): Promise<void> => {
    if (queuedChangesRef.current?.handle !== watched) {
      queuedChangesRef.current = { handle: watched, changes: new Map(), rescan: false };
    }
    const queued = queuedChangesRef.current;
    queued.rescan ||= batch.rescan;
    for (const change of batch.changes) queued.changes.set(change.path, change);
    if (drainingChangesRef.current) return Promise.resolve();
    drainingChangesRef.current = true;
    return (async () => {
      try {
        while (queuedChangesRef.current) {
          const next = queuedChangesRef.current;
          queuedChangesRef.current = null;
          await applyChangeBatchRef.current(next.handle, [...next.changes.values()], next.rescan);
        }
      } finally {
        drainingChangesRef.current = false;
      }
    })();
  }, [applyChangeBatchRef]);

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

    // The app's watcher reports changes at once; this slow poll catches what a watcher cannot see.
    const poller = createAdaptivePoller({ poll: syncWithDisk, config: SAFETY_POLL });
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
    mapAnalysisRecord: state.mapAnalysisRecord,
    recentVaults,
    awaitingVaultChoice,
    storedVaultRecord,
    fileHandles: state.fileHandles,
    imageHandles: state.imageHandles,
    sourceHandles: state.sourceHandles,
    errorMessage: state.errorMessage,
    errorCode: state.errorCode,
    lastLoadedAt: state.lastLoadedAt,
    /** True for a re-read of the same folder (save, focus rescan), false while switching folders; consumers branch on this, not on `status`, so a save does not blank the screen. */
    isReloadingSameVault:
      state.status === 'loading' &&
      state.manifest !== null &&
      state.manifestHandle === state.handle,
    partialTotal: arrivingTotal,
    loadProgressStore,
    arrivalStore,
    restoreAttempted,
    openedInsidePickedFolder,
    dismissOpenedInsideNotice: () => setOpenedInsidePickedFolder(null),
    open,
    openRecent,
    forgetRecent,
    close,
    refresh,
    syncWithDisk,
    applyVaultChangeBatch,
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
