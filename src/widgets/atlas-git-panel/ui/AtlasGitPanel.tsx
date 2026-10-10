"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { countChangesByStatus, formatSnapshotSummary } from "@/shared/lib/atlas-git-changes";
import { describeChangePath, parseUnifiedDiff, splitConceptChanges } from "@/shared/lib/atlas-git-record";
import { isGitBridgeAvailable } from "@/shared/lib/tauri-git";
import { useNativeErrorLookup } from "@/shared/lib/use-native-error-lookup";
import {
  isCanonicalConcept,
  type OntologyChangeset,
  type KnowledgeGraphEdge,
  type KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import { buildConceptEgo, matchNodeId } from "../model/build-concept-ego";
import { useFollowVaultChanges } from "../model/use-follow-vault-changes";
import { useGitInit } from "../model/use-git-init";
import { useGitProbe } from "../model/use-git-probe";
import { useGitRemote } from "../model/use-git-remote";
import { useGitRestore } from "../model/use-git-restore";
import { useGitSnapshot } from "../model/use-git-snapshot";
import { useGitWorkspace } from "../model/use-git-workspace";
import { useWorkbenchSelection } from "../model/use-workbench-selection";
import type { ChangedDocument } from "./PendingDocumentPane";
import { DesktopBody, type GitStage } from "./DesktopBody";
import { NoVaultSetup, WebSetup } from "./SetupMode";
import { cn } from "@/shared/lib/cn";

/**
 * Atlas Git, the body of the history destination: setup mode until the screen can record,
 * then one workbench of step list, commit dock and the selection's detail. Desktop uses the
 * `git.rs` commands through `tauri-git.ts`; a browser cannot spawn a process. Trust charter:
 * mount-time queries are read-only, and writes run only from their own button's click.
 */

export interface AtlasGitPanelProps {
  /**
   * Absolute path of the Tauri desktop vault, from
   * `getTauriVaultRootPath(vault.handle)`. null/undefined renders the web
   * degradation.
   */
  vaultPath?: string | null;
  /** Session changeset for the web degradation summary — HomePage's `ontologyChangeset`. */
  sessionChangeset?: OntologyChangeset | null;
  /**
   * The vault graph, used to map a step's files onto concepts. Passed in rather than read
   * through `useOntologyInsight`, which would make every test of this widget need a provider.
   */
  graph?: { nodes: readonly KnowledgeGraphNode[]; edges: readonly KnowledgeGraphEdge[] } | null;
  className?: string;
}

const noopSubscribe = () => () => {};

export function AtlasGitPanel({
  vaultPath = null,
  sessionChangeset = null,
  graph = null,
  className,
}: AtlasGitPanelProps) {
  const t = useTranslations("atlasGit");
  const nativeErrors = useNativeErrorLookup();
  const format = useFormatter();
  // Kind names come from the `kinds` namespace; a key minted here would drift from it.
  const tKinds = useTranslations("kinds");
  const kindLabel = useCallback(
    (kind: string) => {
      const known = ["project", "domain", "capability", "element", "document", "vault-readme"];
      return tKinds(known.includes(kind) ? kind : "unknown");
    },
    [tKinds],
  );

  // SSR/hydration-safe runtime detection — the server snapshot is false (web),
  // and the client re-renders to true under Tauri (uSES resolves the mismatch).
  const bridgeAvailable = useSyncExternalStore(
    noopSubscribe,
    () => isGitBridgeAvailable(),
    () => false,
  );
  const desktop = bridgeAvailable && Boolean(vaultPath);

  const { gitInstalled, probeGit } = useGitProbe(vaultPath);
  const {
    status,
    remoteState,
    setOriginJustSaved,
    currentBranch,
    changes,
    diffText,
    diffTooLarge,
    history,
    historyHasMore,
    historyLimit,
    setHistoryLimit,
    historyNowMs,
    loadState,
    loadErrorText,
    refresh,
    loadMoreHistory,
    setJumpHash,
    historyShort,
  } = useGitWorkspace({ vaultPath, desktop, nativeErrors });
  // The bridge's `relativeTime` is useful only as a compatibility fallback: it
  // is preformatted by git and can therefore arrive in a different language.
  // Capture one reference instant per successful workspace read. Unrelated
  // renders cannot churn wording, while an explicit refresh/snapshot cannot keep
  // formatting against an hours-old mount instant.
  const localizedHistory = useMemo(
    () =>
      history.map((commit) => {
        const instant = new Date(commit.isoTime);
        if (Number.isNaN(instant.getTime())) return commit;
        try {
          return {
            ...commit,
            relativeTime: format.relativeTime(instant, historyNowMs),
          };
        } catch {
          return commit;
        }
      }),
    [format, history, historyNowMs],
  );
  /*
   * The concepts each step changed, from the per-commit files' kind and slug matched to vault
   * nodes. Both the node and the file's own kind go through `isCanonicalConcept`, so the
   * vault README (`vault-readme`) is never counted as a concept.
   */
  const conceptsByHash = useMemo(() => {
    const nodes = (graph?.nodes ?? []).filter(isCanonicalConcept);
    const map = new Map<string, { id: string; label: string; kind: string }[]>();
    for (const commit of history) {
      const seen = new Set<string>();
      const list: { id: string; label: string; kind: string }[] = [];
      for (const file of commit.files ?? []) {
        if (file.kind && !isCanonicalConcept({ kind: file.kind })) continue;
        const id = matchNodeId(file, nodes);
        if (!id || seen.has(id)) continue;
        const node = nodes.find((n) => n.id === id);
        if (!node) continue;
        seen.add(id);
        list.push({ id, label: node.display || node.title, kind: node.kind });
      }
      map.set(commit.hash, list);
    }
    return map;
  }, [history, graph]);

  const egoFor = useCallback(
    (nodeId: string) =>
      graph ? buildConceptEgo(nodeId, graph.nodes, graph.edges) : null,
    [graph],
  );

  // Split what the user judges (concepts) from the files that ride along. What
  // they have to read here is "which of my concepts changed"; `.gitignore` and
  // `package.json` are recorded too but are not for reading. The commit formula
  // still covers **everything**.
  const { concepts, others } = useMemo(() => splitConceptChanges(changes), [changes]);
  /*
   * Each changed document with the concept it carries, named the way the map names it.
   * The pane reads documents, not kinds: the kind is the glyph on the chip, not a group
   * label over a single row.
   */
  const documents = useMemo<ChangedDocument[]>(() => {
    const nodes = graph?.nodes ?? [];
    return concepts.map((entry) => {
      const id = matchNodeId(entry, nodes);
      const node = id ? nodes.find((n) => n.id === id) : null;
      return {
        entry,
        label: node ? node.display || node.title : describeChangePath(entry.slug, { isConcept: true }).name,
        kind: entry.kind,
      };
    });
  }, [concepts, graph]);
  const statusCounts = useMemo(() => countChangesByStatus(changes), [changes]);
  const predictedSubject = useMemo(() => formatSnapshotSummary(changes), [changes]);
  const hasChanges = changes.length > 0;

  // Per-file diffs with the git plumbing stripped, computed once: the default selection and
  // the per-row line counts both read it, and two computations could state two facts.
  const diffFiles = useMemo(() => parseUnifiedDiff(diffText), [diffText]);
  const {
    selection,
    selectStep,
    jumpToCommit,
    followed,
    setFollowed,
    setSelectionChoice,
    selectedPath,
    setSelectedPath,
    focusedConceptId,
    setFocusedConceptId,
  } = useWorkbenchSelection({
    history,
    historyHasMore,
    historyShort,
    historyLimit,
    setHistoryLimit,
    setJumpHash,
    diffFiles,
    diffTooLarge,
  });

  const stage: GitStage = !bridgeAvailable
    ? "web"
    : !vaultPath
      ? "no-vault"
      /*
       * Missing git is its own state, not an error: it shows the `gitInstallGuide()` guidance
       * under `surfaces.md`'s degradation-card contract.
       */
      : gitInstalled === false
        ? "not-installed"
      : loadState === "error"
        ? "error"
        : !status
          ? "loading"
          : status.initialized
            ? "workbench"
            : "not-initialized";

  const {
    confirming,
    setConfirming,
    pushOptIn,
    setPushOptIn,
    snapshotting,
    snapshotResult,
    snapshotError,
    snapshotPushFailure,
    snapshotMessage,
    setSnapshotMessage,
    confirmSnapshot,
  } = useGitSnapshot({
    vaultPath,
    remoteState,
    refresh,
    nativeErrors,
    setSelectionChoice,
    setSelectedPath,
    setFollowed,
  });
  const { initRunning, initError, initCopyState, copyInitCommand, startTracking } = useGitInit({
    vaultPath,
    refresh,
    nativeErrors,
  });
  const { restoreBusy, restoreNotice, restoreError, restoreDocument } = useGitRestore({
    vaultPath,
    t,
    refresh,
    nativeErrors,
    setSelectionChoice,
    setSelectedPath,
    setJumpHash,
    setFollowed,
  });
  const {
    remoteOpen,
    setRemoteOpen,
    remoteUrl,
    setRemoteUrl,
    remoteRunning,
    remoteError,
    remoteNotice,
    remoteBusy,
    remoteActionNotice,
    remoteActionError,
    runRemote,
    submitRemote,
  } = useGitRemote({
    vaultPath,
    t,
    refresh,
    nativeErrors,
    hasChanges,
    setConfirming,
    setPushOptIn,
    remoteState,
    currentBranch,
    setOriginJustSaved,
  });
  useFollowVaultChanges({
    desktop,
    vaultPath,
    refresh,
    followBusy: snapshotting || initRunning || remoteRunning || remoteBusy !== null || restoreBusy,
  });

  return (
    <section
      aria-label={t("title")}
      data-testid="atlas-git-panel"
      data-stage={stage}
      // No border or background: GitPage owns the frame, so a card shell here would double it.
      className={cn("flex w-full min-h-0 flex-col", className)}
    >
      {/* Setup centres with `m-auto` (not `justify-center`, which clips the top of tall content).
          From `xl` each workbench column scrolls on its own so the commit dock stays in view;
          below `xl` the columns stack and the page scrolls. */}
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-y-auto px-5",
          stage === "workbench"
            ? // Below `lg` the bottom tab bar overlays the page, so the last surface reserves
              // its height (design.md touch contract).
              "py-5 max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+12px)] xl:overflow-hidden"
            : "py-6",
        )}
      >
        {stage === "workbench" ||
        stage === "not-initialized" ||
        stage === "loading" ||
        stage === "error" ? (
          <DesktopBody
            snapshotMessage={snapshotMessage}
            setSnapshotMessage={setSnapshotMessage}
            hostPlatformHint={
              typeof navigator === "undefined"
                ? ""
                : navigator.platform || navigator.userAgent
            }
            onRecheckGit={() => {
              void probeGit();
              void refresh();
            }}
            key={stage}
            t={t}
            vaultPath={vaultPath ?? null}
            stage={stage}
            loadErrorText={loadErrorText}
            status={status}
            documents={documents}
            otherChanges={others}
            statusCounts={statusCounts}
            changeCount={changes.length}
            predictedSubject={predictedSubject}
            hasChanges={hasChanges}
            confirming={confirming}
            setConfirming={setConfirming}
            pushOptIn={pushOptIn}
            setPushOptIn={setPushOptIn}
            snapshotting={snapshotting}
            snapshotResult={snapshotResult}
            snapshotPushFailure={snapshotPushFailure}
            snapshotError={snapshotError}
            confirmSnapshot={confirmSnapshot}
            onRetry={refresh}
            selection={selection}
            setSelection={selectStep}
            diffFiles={diffFiles}
            diffTooLarge={diffTooLarge}
            history={localizedHistory}
            historyHasMore={historyHasMore}
            historyMoreBusy={historyShort}
            onMoreHistory={loadMoreHistory}
            onRestoreDocument={restoreDocument}
            onJumpToCommit={jumpToCommit}
            followed={followed}
            whenOf={(isoTime: string) => {
              const instant = new Date(isoTime);
              if (Number.isNaN(instant.getTime())) return isoTime;
              try {
                return format.relativeTime(instant, historyNowMs);
              } catch {
                return isoTime;
              }
            }}
            restoreBusy={restoreBusy}
            restoreNotice={restoreNotice}
            restoreError={restoreError}
            selectedPath={selectedPath}
            setSelectedPath={setSelectedPath}
            initRunning={initRunning}
            initError={initError}
            initCopyState={initCopyState}
            onInit={startTracking}
            onCopyInitCommand={copyInitCommand}
            remoteOpen={remoteOpen}
            setRemoteOpen={setRemoteOpen}
            remoteUrl={remoteUrl}
            setRemoteUrl={setRemoteUrl}
            remoteRunning={remoteRunning}
            remoteError={remoteError}
            remoteNotice={remoteNotice}
            onSetRemote={submitRemote}
            remoteState={remoteState}
            remoteBusy={remoteBusy}
            onRemoteAction={(kind) => void runRemote(kind)}
            remoteActionNotice={remoteActionNotice}
            remoteActionError={remoteActionError}
            sessionChangeset={sessionChangeset}
            concepts={conceptsByHash}
            egoFor={egoFor}
            kindLabel={kindLabel}
            focusedConceptId={focusedConceptId}
            setFocusedConceptId={setFocusedConceptId}
          />
        ) : stage === "no-vault" ? (
          <NoVaultSetup key={stage} t={t} />
        ) : (
          <WebSetup
            key={stage}
            t={t}
            sessionChangeset={sessionChangeset}
          />
        )}
      </div>
    </section>
  );
}
