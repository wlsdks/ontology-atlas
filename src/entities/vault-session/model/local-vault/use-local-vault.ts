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
 * @internal — do not call directly. Access it through `useLocalVault()`, a consumer of
 * `LocalVaultProvider`. This hook exists so `LocalVaultProvider` can mount it once and
 * keep a single instance of the state, IDB rehydration, fingerprint rescan, and FS reads.
 *
 * Before the provider pattern, eight places called `useLocalVault()` directly, giving two
 * or three instances per page mount — the same IDB key rehydrated N times and N full
 * `buildLocalManifest` walks of the filesystem.
 *
 * Uses a local folder as the vault. Works only in browsers with the File System Access
 * API (Chrome/Edge/Safari 18.2+/Opera).
 * The surface:
 * - `open()` — pick a folder with showDirectoryPicker and store the handle in IDB
 * - `close()` — drop the handle and return to idle
 * - `refresh()` — rescan the current handle to pick up file changes
 * - `requestPermission()` — re-approve when a restored session is permission-needed
 *
 * On first mount it tries to restore the handle stored in IDB: a 'granted' query builds
 * the manifest automatically, while 'prompt' waits in permission-needed.
 */
export function useLocalVaultInternal() {
  // SSR consistency: calling `isSupported()` from the lazy initializer mismatches between
  // SSR (no window → 'unsupported') and the client's first hydration (window → 'idle').
  // Always start 'idle' and let a mount effect switch to 'unsupported' when FSA is
  // missing — one frame looks supported, but the hydration error is gone.
  const [state, setState] = useState<State>(() => emptyState('idle'));
  const stateRef = useLatestRef(state);
  /**
   * **The launch stopped at the chooser on purpose**, because two or more folders are known
   * and the app will not guess between them. Distinct from every other idle state: nothing
   * failed, nothing is missing, and the stored `current` record is still there to go back to.
   *
   * Consumers need it because 'idle' alone cannot carry this fact. The docs surface decides
   * which source to land on by asking whether a local vault loaded (`shouldPreferLocalOnLanding`),
   * and a deferred launch has not loaded one — so without this flag the person who is meant
   * to be choosing a folder lands on the sample instead.
   */
  const [awaitingVaultChoice, setAwaitingVaultChoice] = useState(false);

  /** Fingerprint of the last successful build — the comparison that lets auto-refresh skip. */
  const lastFingerprintRef = useRef<string | null>(null);

  /**
   * The reusable entries of the last successful build and the handle they came from. The
   * next `load` of the same vault uses them for an incremental rebuild (re-reading only
   * changed files). Reset to null on a different vault or a failed build, falling back to
   * a full build. A ref, not state, so it triggers no re-render.
   */
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
       * **Re-reading a folder that is already open is not opening one.**
       *
       * The 5-second watch calls this whenever the fingerprint moves, and it used to
       * drop back to `loading` every time. Everything the screen derives from
       * `status === 'loaded'` went with it: measured on the map at 1512x982 with
       * nothing touched, the INDEX lost the folder's name and document count for
       * ~3.5 s out of every ~8.6 s, and while it was gone the recent filter claimed
       * nothing at all in seven days on a folder where 20 of 20 documents had
       * changed that same day.
       * A false zero is worse than a stale one.
       *
       * So a rebuild of the same handle keeps the frame that is already on screen and
       * swaps in the new manifest when it arrives. A different folder, or one that is
       * not loaded yet, still shows `loading` — there is nothing to keep there.
       */
      return s.status === 'loaded' && s.handle === handle ? cleared : { ...cleared, status: 'loading' };
    });
    try {
      // With a previous build of the same vault (identical handle), rebuild incrementally —
      // re-reading only changed files, which is what removes the live-update lag on a large
      // vault. First load, a different vault, or a failed incremental falls back to a full
      // build; the results are byte-equivalent (proven by incremental.test).
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
       * **A creation door's starter lands before the folder is first shown** (2026-09-25, D1).
       *
       * "Just start" and "Create a new folder" used to open the folder and then wait for the
       * next render of the screen that pressed them to write the starter. That screen never
       * rendered again: the shell swaps it for the opening pane the moment the open begins, and
       * the root entry swaps that for the map. The folder opened empty with no error, three
       * runs out of three. Written here, the starter is part of the open itself, so it does not
       * matter which screen is on the glass, and the map is never drawn empty first.
       *
       * Only into a folder with no documents: picking an existing vault through a creation
       * door must not plant examples in it. A failure does not fail the open (the folder is
       * readable and is shown); it is handed back so the door can say the starter is missing.
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
       * The chooser's row facts are written here, by the one path that has already paid for
       * the walk. A folder the person is *offered* cannot be counted at the moment of
       * offering — on the web reading it needs the permission gesture they have not made
       * yet, and on the desktop five rows would mean five vault reads — so the count is
       * taken when the folder is open and the row states its age.
       *
       * ⚠️ **Its own try/catch, not the load's.** This runs after the vault is already
       * `loaded`, so a failure here reaching the outer catch would take a successfully
       * opened folder and report it as broken — trading the whole screen for a cache write.
       * A `.catch()` alone is not enough either: a synchronous throw (an absent export under
       * a partial module mock, which is exactly how the existing tests stub this module)
       * never becomes a rejected promise. The row is built to say it has no counts, and
       * that is the correct outcome of every failure here.
       */
      try {
        /*
         * ⚠️ **Never awaited. `load()` resolving means "the manifest is live", and nothing
         * else may be added to that promise.**
         *
         * It was awaited here for one revision, to stop a navigation racing the write, and
         * that broke renaming a document for every person: `handleRenameCurrent` awaits
         * `renameDoc` — which calls this `load` — and only then records the slugs it touched
         * in `appTouchedSlugsRef`, the guard that keeps the missing-document verdict quiet
         * for the app's own action. Awaiting an IndexedDB round trip *after* `setState` has
         * published the new manifest opened a window where React had already committed the
         * rename (so the old slug was gone from `docsBySlug`) while the guard was still
         * empty — so the address's old name was judged missing and the screen said it could
         * not find that document in this folder, half a second after a rename that had
         * succeeded. The banner named the **old** slug while its own fallback link already
         * pointed at the **new** one, which is what settles the diagnosis. Caught by
         * `tests/e2e/docs-rename-address.spec.ts`, which exists for exactly that false
         * warning (CI shard chromium 2/3, 2026-09-13).
         *
         * The cost of not awaiting is that leaving the folder within the write window loses
         * the counts, and the row then says "not counted yet" — an honest unknown, and one
         * `countedAgo` labels. Telling somebody their document is lost when it is not is a
         * different order of wrong.
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
      // `toErrorMessage` preserves the cause string. Tauri commands return `Err(String)`, so
      // `invoke` rejects with a *string* rather than an Error; the previous
      // `err instanceof Error ? err.message : null` discarded it wholesale and silenced every
      // desktop vault access failure behind a generic banner. An empty message stays null so
      // the picker's locale-aware `errorFallback` fills it.
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

  /**
   * User-initiated refresh. An unchanged fingerprint (nothing changed outside) skips the full
   * rebuild but still updates `lastLoadedAt` so the picker's "just scanned" label stays
   * accurate. A failure to compute the fingerprint falls back safely to a full rebuild.
   */
  const refresh = useCallback(async () => {
    const handle = stateRef.current.handle;
    const session = vaultReadSessionRef.current;
    const isCurrent = () => mountedRef.current && vaultReadSessionRef.current === session && session.handle === handle;
    if (!handle || !isCurrent()) return;
    let nativeStamps: VaultStampIndex | null = null;
    try {
      /*
       * Take the fingerprint **and the stamps behind it**. Previously only the fingerprint was
       * taken and the stamps discarded, so the incremental rebuild that followed walked the same
       * vault a second time — two native walks per change. Now one.
       */
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

  // Auto-refresh when the tab regains focus, so editing in an IDE and coming back rescans
  // by itself. Debounced by 2 s against duplicate calls. The fingerprint is compared first
  // and an unchanged one skips the full rebuild, which removes the brief freeze on focus
  // with a large vault.
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
     * Is this **a re-read of the same folder**? A save, or a rescan after the tab regains focus.
     *
     * Why it is exposed: a consumer that returns empty on `status !== 'loaded'` makes the whole
     * screen blank and come back on every save. Measured 2026-07-26: right after an inline save
     * the entire insights tab vanished, and the "saved" confirmation on the component unmounted
     * in that frame was never seen at all. Re-reading does not mean there is no data — showing
     * what was there a moment ago is the honest thing to do meanwhile. It is false while
     * **switching** folders, so the previous folder is never drawn as if it were the new one.
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
    /**
     * Clears that notice once it has been read.
     *
     * ⚠️ A one-time fact must not become permanent furniture. It is set when the substitution
     * happens and nothing else clears it, so without this the line sits in the panel for the rest of
     * the session, long after it has told the person everything it knows.
     */
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
