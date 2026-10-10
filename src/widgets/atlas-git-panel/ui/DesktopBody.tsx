"use client";

import type { CopyFeedbackState } from "@/shared/lib/use-copy-feedback";
import type { GitRemoteState, RemoteAction } from "../lib/remote-state";
import { stripConventionalPrefix, humanizeStepSubject } from "../lib/step-title";
import type { DocumentFollow } from "../lib/document-follow";
import { RefreshCw } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { countChangesByStatus } from "@/shared/lib/atlas-git-changes";
import { describeSnapshotSubject, type AtlasGitDiffFile } from "@/shared/lib/atlas-git-record";
import type {
  GitChangeEntry,
  GitCommitInfo,
  GitSnapshotResult,
  GitStatusResult,
} from "@/shared/lib/tauri-git";
import type { OntologyChangeset } from "@/entities/knowledge-graph";
import { gitHostPlatformFrom, gitInstallGuide } from "@/shared/lib/git-install-guide";
import { Button, controlClass } from "@/shared/ui";
import type { ConceptEgo } from "../model/build-concept-ego";
import { CommitDetail } from "./CommitDetail";
import { PendingDocumentPane, type ChangedDocument } from "./PendingDocumentPane";
import { cn } from "@/shared/lib/cn";
import type { Translator } from "../lib/translator";
import type { WorkbenchSelection } from "../model/use-workbench-selection";
import { SETUP_ACTION_PLACEMENT, PageHeader, SetupFrame, SessionChangeSummary } from "./SetupMode";
import { LocationLine, RemoteResultLine, RemoteSetup } from "./RemoteControls";
import { StepList, StepListScroller } from "./StepList";
import { ActionDock, DiscardDock } from "./ActionDock";

/**
 * The stage: only `workbench` can record. `loading` and `error` use the setup frame too,
 * since waiting or re-checking is all the user can do.
 */
export type GitStage = "web" | "no-vault" | "loading" | "not-installed" | "error" | "not-initialized" | "workbench";

export function DesktopBody({
  t,
  snapshotMessage,
  setSnapshotMessage,
  stage,
  hostPlatformHint,
  onRecheckGit,
  loadErrorText,
  status,
  documents,
  otherChanges,
  statusCounts,
  changeCount,
  predictedSubject,
  hasChanges,
  confirming,
  setConfirming,
  pushOptIn,
  setPushOptIn,
  snapshotting,
  snapshotResult,
  snapshotPushFailure,
  snapshotError,
  confirmSnapshot,
  onRetry,
  selection,
  setSelection,
  diffFiles,
  diffTooLarge,
  history,
  historyHasMore,
  historyMoreBusy,
  onMoreHistory,
  onRestoreDocument,
  onJumpToCommit,
  followed,
  whenOf,
  restoreBusy,
  restoreNotice,
  restoreError,
  selectedPath,
  setSelectedPath,
  initRunning,
  initError,
  initCopyState,
  onInit,
  onCopyInitCommand,
  remoteOpen,
  setRemoteOpen,
  remoteUrl,
  setRemoteUrl,
  remoteRunning,
  remoteError,
  remoteNotice,
  onSetRemote,
  remoteState,
  remoteBusy,
  onRemoteAction,
  remoteActionNotice,
  remoteActionError,
  sessionChangeset,
  concepts,
  egoFor,
  kindLabel,
  focusedConceptId,
  setFocusedConceptId,
  vaultPath,
}: {
  snapshotMessage: string;
  setSnapshotMessage: (v: string) => void;
  /** The connected vault is the exact scope of each selected commit's lazy patch read. */
  vaultPath: string | null;
  /** `navigator.platform ?? userAgent` — the hint that picks per-platform install guidance. */
  hostPlatformHint: string;
  /** Re-checks for git, so someone who just installed it need not restart the app. */
  onRecheckGit: () => void;
  t: Translator;
  stage: Extract<GitStage, "loading" | "not-installed" | "error" | "not-initialized" | "workbench">;
  loadErrorText: string | null;
  status: GitStatusResult | null;
  documents: ChangedDocument[];
  otherChanges: GitChangeEntry[];
  statusCounts: ReturnType<typeof countChangesByStatus>;
  changeCount: number;
  predictedSubject: string;
  hasChanges: boolean;
  confirming: boolean;
  setConfirming: (v: boolean) => void;
  pushOptIn: boolean;
  setPushOptIn: (v: boolean) => void;
  snapshotting: boolean;
  snapshotResult: GitSnapshotResult | null;
  snapshotPushFailure: string | null;
  snapshotError: string | null;
  confirmSnapshot: () => void;
  onRetry: () => void;
  selection: WorkbenchSelection;
  setSelection: (v: WorkbenchSelection) => void;
  diffFiles: AtlasGitDiffFile[];
  diffTooLarge: boolean;
  history: GitCommitInfo[];
  /** Whether git holds steps older than `history` — drawn as one "show older steps" row. */
  historyHasMore: boolean;
  historyMoreBusy: boolean;
  onMoreHistory: () => void;
  /** Restores one document to `source` (`HEAD` or a hash); resolves true when git did it. */
  onRestoreDocument: (relativePath: string, source: string, others: number) => Promise<boolean>;
  /**
   * Selects a step by hash, reading deeper into the list when it is not loaded yet, and keeps
   * following the document the jump was made from.
   */
  onJumpToCommit: (hash: string, follow: DocumentFollow) => void;
  /** The document a jump is following, and the step it jumped to. */
  followed: (DocumentFollow & { hash: string }) | null;
  /** The list's own relative-time wording for an ISO instant. */
  whenOf: (isoTime: string) => string;
  restoreBusy: boolean;
  restoreNotice: string | null;
  restoreError: string | null;
  selectedPath: string | null;
  setSelectedPath: (v: string | null) => void;
  initRunning: boolean;
  initError: string | null;
  initCopyState: CopyFeedbackState;
  onInit: () => void;
  onCopyInitCommand: () => void;
  remoteOpen: boolean;
  setRemoteOpen: (v: boolean) => void;
  remoteUrl: string;
  setRemoteUrl: (v: string) => void;
  remoteRunning: boolean;
  remoteError: string | null;
  remoteNotice: string | null;
  onSetRemote: () => void;
  /**
   * Where this branch's steps can go, read by the panel: the status's answer, with an `origin`
   * that `git_set_remote` just saved counted before the status read says so.
   */
  remoteState: GitRemoteState;
  remoteBusy: null | RemoteAction;
  onRemoteAction: (kind: RemoteAction) => void;
  remoteActionNotice: string | null;
  remoteActionError: string | null;
  sessionChangeset: OntologyChangeset | null;
  /** Step hash → the vault concepts that step changed. */
  concepts: ReadonlyMap<string, readonly { id: string; label: string; kind: string }[]>;
  egoFor: (nodeId: string) => ConceptEgo | null;
  kindLabel: (kind: string) => string;
  focusedConceptId: string | null;
  setFocusedConceptId: (id: string) => void;
}) {
  /**
   * Hash of the commit just recorded; only that row settles with `--motion-settle`. Rows are
   * keyed by hash, so existing rows keep their DOM and do not replay.
   */
  const settledHash = snapshotResult?.commitHash ?? null;

  if (stage === "loading") {
    return (
      <SetupFrame
        t={t}
        step={null}
        state="loading"
        title={t("loading")}
        note={t("scopeNotice")}
      />
    );
  }
  if (stage === "not-installed") {
    /*
     * The degradation card (`surfaces.md`): why (`install.title`, `install.body`), where
     * (`gitInstallGuide(platform)` command and download link, prefixed ↗ per design.md), and
     * re-check (`install.recheck`).
     */
    const guide = gitInstallGuide(gitHostPlatformFrom(hostPlatformHint));
    const options = [guide.primary, ...guide.alternatives];
    return (
      <SetupFrame
        t={t}
        step={null}
        state="error"
        title={t("install.title")}
        body={t("install.body")}
        note={t("scopeNotice")}
      >
        <div className="flex flex-col gap-3" data-testid="atlas-git-not-installed">
          <ul className="flex flex-col gap-2">
            {options.map((option) => (
              <li key={option.labelKey} className="flex items-center gap-2">
                <span className="text-label text-[color:var(--color-text-tertiary)]">
                  {t(option.labelKey)}
                </span>
                {option.command ? (
                  <code className="rounded-[var(--radius-chip)] bg-[color:var(--color-overlay-1)] px-2 py-0.5 font-mono text-label text-[color:var(--color-text-secondary)]">
                    {option.command}
                  </code>
                ) : option.href ? (
                  <a
                    href={option.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    data-testid="atlas-git-install-download"
                    className={controlClass({ shape: "link", tone: "accent", className: "rounded-[var(--radius-chip)] px-1 underline-offset-2 hover:underline" })}
                  >
                    ↗ {option.href}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
          <Button
            variant="outline"
            size="sm"
            data-testid="atlas-git-install-recheck"
            onClick={() => {
              onRecheckGit();
            }}
            className={cn(SETUP_ACTION_PLACEMENT, "self-start")}
          >
            <RefreshCw size={ICON_SIZE.md} aria-hidden />
            {t("install.recheck")}
          </Button>
        </div>
      </SetupFrame>
    );
  }

  if (stage === "error") {
    // An error must not be a dead end either — a re-check button sits in the same
    // place, so the user can recover without leaving the app once the folder is back.
    return (
      <SetupFrame
        t={t}
        step={null}
        state="error"
        title={t("loadError")}
        body={loadErrorText ?? undefined}
        note={t("scopeNotice")}
      >
        <div className="flex flex-col gap-3" data-testid="atlas-git-load-error">
          <Button
            variant="outline"
            size="sm"
            data-testid="atlas-git-retry"
            onClick={onRetry}
            className={cn(SETUP_ACTION_PLACEMENT, "self-start")}
          >
            <RefreshCw size={ICON_SIZE.md} aria-hidden />
            {t("retryButton")}
          </Button>
        </div>
      </SetupFrame>
    );
  }
  if (stage === "not-initialized") {
    // A press in a folder the person chose is not automatic execution, so init is offered here
    // instead of sending them to a terminal; `startTracking` holds the click-only rule.
    return (
      <SetupFrame
        t={t}
        step={3}
        state="not-initialized"
        title={t("notInitialized")}
        body={t("notInitializedHint")}
        note={t("initEscape")}
      >
        <div className="flex flex-col gap-4" data-testid="atlas-git-not-initialized">
          {/* Say what will be created **before** it is pressed. */}
          <p className="text-body leading-body text-[color:var(--color-text-tertiary)]">
            {t("initWhatHappens")}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              data-testid="atlas-git-init"
              disabled={initRunning}
              onClick={onInit}
              className={SETUP_ACTION_PLACEMENT}
            >
              {initRunning ? t("initRunning") : t("initButton")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              data-testid="atlas-git-init-copy"
              title={t("initTerminalHint")}
              onClick={onCopyInitCommand}
              className={SETUP_ACTION_PLACEMENT}
            >
              {initCopyState === "copied"
                ? t("webCopied")
                : initCopyState === "failed"
                  ? t("webCopyFailed")
                  : t("initTerminalButton")}
            </Button>
          </div>

          {initError ? (
            <p
              className="git-fade-in text-label text-[color:var(--color-danger-text)]"
              data-testid="atlas-git-init-error"
            >
              {initError}
            </p>
          ) : null}
          {/* How to undo it (`initEscape`) is the stage's `note`, just before the action. */}

          {/* Even without git, what changed this session is known from the per-vault baseline. */}
          <SessionChangeSummary
            t={t}
            changeset={sessionChangeset}
            title={t("initSessionTitle")}
          />
        </div>
      </SetupFrame>
    );
  }

  const upstream = status?.upstream ?? null;
  const branch = status?.branch ?? null;
  // The address form only without any `origin`; with one it would rewrite the real remote.
  const showRemoteSetup = remoteOpen && remoteState === "no-remote";
  const deltaByPath = new Map(
    diffFiles.map((file) => [file.path, { added: file.added, removed: file.removed }]),
  );

  const locationLine = (
    <LocationLine
      t={t}
      branch={branch}
      upstream={upstream}
      remoteState={remoteState}
      headShortHash={status?.headShortHash ?? null}
      ahead={status?.ahead ?? null}
      behind={status?.behind ?? null}
      remoteOpen={remoteOpen}
      setRemoteOpen={setRemoteOpen}
      remoteBusy={remoteBusy}
      onRemoteAction={onRemoteAction}
      pendingCount={hasChanges ? changeCount : 0}
    />
  );

  /*
   * A step named by what it changed, for a document's history rows: its concepts, then the
   * documents an automatic subject names, then the person's sentence without its code.
   */
  const stepTitleOf = (commit: GitCommitInfo): string => {
    const stepConcepts = concepts.get(commit.hash) ?? [];
    const more = (count: number) => t("moreSlugs", { count });
    if (stepConcepts.length > 0) {
      const names = stepConcepts.slice(0, 2).map((concept) => concept.label).join(", ");
      return stepConcepts.length > 2 ? `${names} ${more(stepConcepts.length - 2)}` : names;
    }
    const summary = describeSnapshotSubject(commit.subject);
    if (summary.matched) {
      const names = summary.slugs.map((slug) => slug.split("/").pop() ?? slug).join(", ");
      if (names) return summary.overflow > 0 ? `${names} ${more(summary.overflow)}` : names;
      return humanizeStepSubject(t, commit.subject) ?? commit.subject;
    }
    return stripConventionalPrefix(commit.subject);
  };

  const dock = (
    <ActionDock
      t={t}
      onConnectRemote={() => setRemoteOpen(true)}
      remoteState={remoteState}
      branch={branch}
      headShortHash={status?.headShortHash ?? null}
      remoteBusy={remoteBusy}
      onSendBranch={() => onRemoteAction("push")}
      hasChanges={hasChanges}
      changeCount={changeCount}
      predictedSubject={predictedSubject}
      confirming={confirming}
      setConfirming={setConfirming}
      pushOptIn={pushOptIn}
      setPushOptIn={setPushOptIn}
      snapshotting={snapshotting}
      snapshotResult={snapshotResult}
      snapshotPushFailure={snapshotPushFailure}
      snapshotError={snapshotError}
      confirmSnapshot={confirmSnapshot}
      upstream={upstream}
      snapshotMessage={snapshotMessage}
      setSnapshotMessage={setSnapshotMessage}
    />
  );

  const remotePanel = showRemoteSetup ? (
    <RemoteSetup
      t={t}
      remoteUrl={remoteUrl}
      setRemoteUrl={setRemoteUrl}
      remoteRunning={remoteRunning}
      remoteError={remoteError}
      remoteNotice={remoteNotice}
      onSubmit={onSetRemote}
    />
  ) : null;

  /*
   * The detail column exists whenever there is anything to commit, a diff or history; new
   * documents alone produce no diff lines but still need the change list.
   */
  const showEvidence = statusCounts.total > 0 || diffFiles.length > 0 || history.length > 0;

  /*
   * One workbench shape: the right column is the selection's detail, so it has content even
   * with nothing to commit. Uncommitted work shows only as the list's top row.
   */
  return (
    <div
      data-testid="atlas-git-workbench"
      data-shape="decide"
      /*
       * Below `xl` the columns stack and the page scrolls, so the workbench grows with content
       * instead of squeezing the reader to nothing; only at `xl` is height a budget.
       */
      className="git-fade-in flex flex-1 flex-col xl:min-h-0"
    >
      {/*
        No card shell: the workbench is the whole surface, fills the viewport and scrolls inside,
        under one top bar (title, location, actions) and a divider.
      */}
      <div className="flex flex-none flex-wrap items-center gap-x-3 gap-y-2 border-b border-[color:var(--color-divider)] px-1 pb-3">
        <PageHeader t={t} inColumn showScope={false} />
        <div className="ml-auto flex min-w-0 items-center gap-3">{locationLine}</div>
      </div>
      <RemoteResultLine notice={remoteActionNotice} error={remoteActionError} />
      <RemoteResultLine kind="restore" notice={restoreNotice} error={restoreError} />

      <div
        className={cn(
          // `content-start` below `xl`: a short list must not be stretched to the window,
          // which left a dead band between the dock and the stacked reader.
          "grid flex-1 grid-cols-1 max-xl:content-start xl:min-h-0",
          showEvidence
            ? "xl:grid-cols-[minmax(0,var(--git-timeline-w))_minmax(0,1fr)]"
            : "mx-auto w-full max-w-[var(--git-single-measure)]",
        )}
      >
        <div className="flex min-w-0 flex-col xl:min-h-0 xl:border-r xl:border-[color:var(--color-divider)]">
          {remotePanel ? <div className="flex-none px-4 pt-3">{remotePanel}</div> : null}
          {/* With nothing to commit the list head states the current state, not the dock's message. */}
          {!hasChanges ? (
            <p className="flex-none border-b border-[color:var(--color-divider)] px-4 py-3 text-label leading-prose text-[color:var(--color-text-tertiary)]">
              {t("noChangesHint")}
            </p>
          ) : null}
          {/*
            Below `xl` the list is capped and scrolls in place, so the picked step's headline
            starts inside the first window.
          */}
          <StepListScroller
            hasMore={historyHasMore}
            busy={historyMoreBusy}
            onMore={onMoreHistory}
            /*
             * With a step picked the stacked list shrinks further and `revealSelectedRow` keeps
             * the picked row in view.
             */
            /* About three two-line steps; the faded bottom edge says the rest scrolls here. */
            className={
              selection.kind === "commit"
                ? "max-xl:max-h-44"
                : "max-xl:max-h-[var(--git-evidence-stack-max)]"
            }
          >
            <StepList
              t={t}
              history={history}
              hasMore={historyHasMore}
              moreBusy={historyMoreBusy}
              onMore={onMoreHistory}
              concepts={concepts}
              settledHash={settledHash}
              pendingCount={statusCounts.total}
              selection={selection}
              setSelection={setSelection}
              ahead={status?.ahead ?? null}
              behind={status?.behind ?? null}
              upstream={upstream}
              onRemoteAction={onRemoteAction}
            />
          </StepListScroller>
          {dock ? <div className="flex-none px-4 pb-3">{dock}</div> : null}
        </div>

        {showEvidence ? (
          <div
            data-testid="atlas-git-evidence"
            /*
             * The whole column is one scroll region; two `flex-1` halves would silently clip rows.
             */
            /*
             * Below `xl` the column is capped, so a long document does not push the discard door
             * to the page bottom.
             */
            className="flex min-w-0 flex-col max-xl:max-h-[var(--git-evidence-stack-max)] max-xl:overflow-y-auto xl:min-h-0 xl:overflow-y-auto"
          >
            {/* The right side draws the one thing selected on the left. */}
            {selection.kind === "pending" ? (
              <PendingDocumentPane
                t={t}
                vaultPath={vaultPath}
                documents={documents}
                others={otherChanges}
                summary={[
                  statusCounts.added > 0 ? t("statusAdded", { count: statusCounts.added }) : null,
                  statusCounts.modified > 0 ? t("statusModified", { count: statusCounts.modified }) : null,
                  statusCounts.deleted > 0 ? t("statusDeleted", { count: statusCounts.deleted }) : null,
                  statusCounts.renamed > 0 ? t("statusRenamed", { count: statusCounts.renamed }) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                hunks={diffFiles}
                hunksTooLarge={diffTooLarge}
                selectedPath={selectedPath}
                setSelectedPath={setSelectedPath}
                stagedOutsideCount={status?.stagedOutsideVault.length ?? 0}
                discard={(doc) =>
                  doc.entry.status !== "added" && doc.entry.status !== "renamed" ? (
                    <DiscardDock
                      t={t}
                      path={doc.entry.path}
                      status={doc.entry.status}
                      delta={deltaByPath.get(doc.entry.path) ?? null}
                      others={Math.max(0, statusCounts.total - 1)}
                      busy={restoreBusy}
                      onDiscard={(path, others) => onRestoreDocument(path, "HEAD", others)}
                    />
                  ) : null
                }
              />
            ) : (
              (() => {
                const picked = history.find((c) => c.hash === selection.hash);
                if (!picked) return null;
                return (
                  <CommitDetail
                    key={`${vaultPath ?? ""}:${picked.hash}:${(concepts.get(picked.hash) ?? []).length}`}
                    t={t}
                    vaultPath={vaultPath}
                    hash={picked.hash}
                    isoTime={picked.isoTime}
                    relativeTime={picked.relativeTime}
                    subject={picked.subject}
                    headline={humanizeStepSubject(t, picked.subject)}
                    concepts={concepts.get(picked.hash) ?? []}
                    files={picked.files ?? []}
                    pendingDelta={deltaByPath}
                    onRestore={(path, others) => onRestoreDocument(path, picked.hash, others)}
                    restoreBusy={restoreBusy}
                    onJumpToCommit={onJumpToCommit}
                    follow={followed?.hash === picked.hash ? followed : null}
                    whenOf={whenOf}
                    stepTitleOf={stepTitleOf}
                    focusedConceptId={focusedConceptId}
                    setFocusedConceptId={setFocusedConceptId}
                    egoFor={egoFor}
                    kindLabel={kindLabel}
                  />
                );
              })()
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
