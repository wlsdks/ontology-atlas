"use client";

import { Fragment, useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { listen } from "@tauri-apps/api/event";
import { useCopyFeedback, type CopyFeedbackState } from "@/shared/lib/use-copy-feedback";
import { useArrivalMemory } from "@/shared/lib/route-arrival-memory";
import { useRovingRows } from "@/shared/lib/use-roving-rows";
import { describeRemoteState, type GitRemoteState } from "../lib/remote-state";
import { stepRowMotionClass, stepRowUsesStagger } from "../lib/step-row-motion";
import { stepFileNames, stripConventionalPrefix } from "../lib/step-title";
import type { DocumentFollow } from "../lib/document-follow";
import { useFormatter, useTranslations } from "next-intl";
// Aliased: under HMR a bare `History` can resolve to the DOM's global `History` constructor
// and throw "Illegal constructor"; an alias cannot collide with a global.
import {
  Check,
  Download,
  FolderOpen,
  History as HistoryIcon,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { CONTROL_DISABLED_CLASS, fieldClass } from "@/shared/ui/control-class";
import { badgeClass } from "@/shared/ui/badge-class";
import { Link } from "@/i18n/navigation";
import {
  countChangesByStatus,
  formatSnapshotSummary,
} from "@/shared/lib/atlas-git-changes";
import {
  describeChangePath,
  describeSnapshotSubject,
  parseUnifiedDiff,
  splitConceptChanges,
  type AtlasGitDiffFile,
} from "@/shared/lib/atlas-git-record";
import {
  gitDiff,
  gitFetch,
  gitErrorMessage,
  gitHistory,
  gitInit,
  gitPull,
  gitProbe,
  gitSetRemote,
  gitSnapshot,
  gitStatus,
  isGitBridgeAvailable,
  type GitChangeEntry,
  type GitCommitInfo,
  type GitSnapshotResult,
  type GitStatusResult,
  gitRestoreFile,
} from "@/shared/lib/tauri-git";
import { useNativeErrorLookup } from "@/shared/lib/use-native-error-lookup";
import {
  isCanonicalConcept,
  type OntologyChangeset,
  type KnowledgeGraphEdge,
  type KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import { gitHostPlatformFrom, gitInstallGuide } from "@/shared/lib/git-install-guide";
import { OntologyMapKindGlyph } from "@/shared/ui/map-kind-glyph";
import { Checkbox, controlClass } from "@/shared/ui";
import { Tooltip } from "@/shared/ui/tooltip";
import { buildConceptEgo, matchNodeId, type ConceptEgo } from "../model/build-concept-ego";
import { CommitDetail } from "./CommitDetail";
import {
  CONFIRM_CANCEL_CLASS,
  CONFIRM_PRIMARY_CLASS,
  DocumentConfirmStep,
  useInlineConfirmFocus,
} from "./DocumentConfirmStep";
import { PendingDocumentPane, type ChangedDocument } from "./PendingDocumentPane";
import { cn } from "@/shared/lib/cn";

/**
 * Atlas Git, the body of the history destination. When the screen cannot record yet it is
 * setup mode: one centred column, one primary action and the three-step `ConnectLadder`
 * (a remote is optional, not a step). Otherwise it is one workbench: the step list and commit
 * dock on the left and, whenever there is anything to show, the selection's detail on the
 * right. Raw diff headers and automatic subjects are read back in human language by
 * the `atlas-git-record.ts` helpers; the raw text stays in the detail.
 *
 * Desktop uses the `src-tauri/src/git.rs` commands through `tauri-git.ts`; a browser cannot
 * spawn a process, so getting the app is its one action. Trust charter: mount-time queries
 * are read-only, and `git_init`, `git_set_remote` and `git_snapshot` run only from their own
 * button's click, which tests pin.
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

/** The setup's terminal escape; git vocabulary appears only here. */
const INIT_CLI_COMMAND = "git init";

/**
 * The setup screens' one primary action, all at one weight: `--git-setup-action-height`
 * (36px, 44px on a coarse pointer) at `text-body`.
 */
const PRIMARY_ACTION_CLASS =
  // Disabled styling arrives as one value-layer set (55 dim, cursor, hover
  // neutralised). This is a filled control, so the hover-neutralising
  // `bg-inherit` would erase the fill; the base fill is pinned again after it,
  // and consumers go through cn(twMerge), so the later declaration wins.
  `inline-flex h-[var(--git-setup-action-height)] shrink-0 items-center justify-center gap-1.5 rounded-[var(--chrome-radius-inner)] bg-[color:var(--color-indigo-brand)] px-4 text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-on-accent)] transition-colors hover:bg-[color:var(--color-indigo-brand-hover)] ${CONTROL_DISABLED_CLASS} disabled:hover:bg-[color:var(--color-indigo-brand)]`;

/** Secondary escape — present, but never competing with the primary action. */
const SECONDARY_ACTION_CLASS =
  "inline-flex h-[var(--git-setup-action-height)] shrink-0 items-center justify-center gap-1.5 rounded-[var(--chrome-radius-inner)] border border-[color:var(--color-border-soft)] px-3.5 text-body text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]";

/**
 * The commit slot when there is nothing to record: kept in place as a quiet "done" shape
 * rather than a faded primary. It and the commit door use the chip `lg` step, matching the
 * confirm pair that replaces the door.
 */
const SNAPSHOT_INERT_CLASS =
  "inline-flex min-h-8 shrink-0 items-center justify-center gap-1.5 rounded-chip border border-[color:var(--color-border-soft)] px-3 py-1 text-body text-[color:var(--color-text-quaternary)]";

const noopSubscribe = () => () => {};

type GitWorkspaceRead = {
  status: GitStatusResult;
  changes: GitChangeEntry[];
  diffText: string;
  diffTooLarge: boolean;
  history: GitCommitInfo[];
  /** Whether git holds steps older than the ones read — the list says so instead of just stopping. */
  historyHasMore: boolean;
};

/**
 * One workspace read plus the instant it was read at, which is what the panel remembers
 * across a route change (`shared/lib/route-arrival-memory.ts`).
 */
type GitWorkspaceMemory = {
  read: GitWorkspaceRead;
  referenceMs: number;
};

/** Steps read per page, about what one column holds at a 14-inch height. */
const HISTORY_PAGE = 10;

/**
 * How long after the watcher's last `vault-changed` the screen re-reads. The Rust watcher
 * already coalesces file events over 500 ms; this only keeps a burst of its emits from
 * queueing one read per emit.
 */
const FOLLOW_DEBOUNCE_MS = 300;

/* Stable empty values, so the `useMemo` dependencies below do not change every render. */
const NO_CHANGES: readonly GitChangeEntry[] = [];
const NO_HISTORY: readonly GitCommitInfo[] = [];

/**
 * Reads one step past the limit so the list knows whether older steps exist, rather than
 * guessing from a count that happens to equal the page size.
 */
async function readGitHistoryPage(
  vaultPath: string,
  limit: number,
): Promise<{ history: GitCommitInfo[]; historyHasMore: boolean }> {
  const rows = (await gitHistory(vaultPath, limit + 1)) ?? [];
  return { history: rows.slice(0, limit), historyHasMore: rows.length > limit };
}

async function readGitWorkspace(
  vaultPath: string,
  historyLimit: number,
): Promise<GitWorkspaceRead | null> {
  const status = await gitStatus(vaultPath);
  if (!status) return null;
  if (!status.initialized) {
    return { status, changes: [], diffText: "", diffTooLarge: false, history: [], historyHasMore: false };
  }
  const [diff, page] = await Promise.all([gitDiff(vaultPath), readGitHistoryPage(vaultPath, historyLimit)]);
  return {
    status,
    changes: diff?.files ?? [],
    diffText: diff?.diff ?? "",
    diffTooLarge: diff?.tooLarge ?? false,
    ...page,
  };
}

/**
 * The human wording of a step's subject: an automatic `ontology snapshot: …` subject becomes
 * counts in the reader's language, and a subject a person wrote stays as written. `null`
 * means the subject is already human language.
 */
function humanizeStepSubject(t: Translator, subject: string): string | null {
  const summary = describeSnapshotSubject(subject);
  if (!summary.matched) return null;
  const parts = [
    summary.added > 0 ? t("statusAdded", { count: summary.added }) : null,
    summary.updated > 0 ? t("statusModified", { count: summary.updated }) : null,
    summary.renamed > 0 ? t("statusRenamed", { count: summary.renamed }) : null,
    summary.removed > 0 ? t("statusDeleted", { count: summary.removed }) : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : t("stepNoConcepts");
}

/**
 * Section label in the body face at `--text-label` with quaternary ink; a mono uppercase
 * tracked eyebrow is Latin-only and breaks Hangul word spacing.
 */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-label font-[var(--font-weight-signature)] text-[color:var(--color-text-quaternary)]">
      {children}
    </span>
  );
}

/**
 * What the workbench is currently showing. `pending` = changes not yet
 * committed, `commit` = the commit at that hash.
 */
export type WorkbenchSelection = { kind: "pending" } | { kind: "commit"; hash: string };

/**
 * The presses that reach the remote. On a branch `origin` has never seen, `push` is its first
 * send (`push -u`, see `describeRemoteState`): the one press that turns a saved address into an
 * upstream.
 */
type RemoteAction = "fetch" | "pull" | "push";

/**
 * The stage: only `workbench` can record. `loading` and `error` use the setup frame too,
 * since waiting or re-checking is all the user can do.
 */
type GitStage = "web" | "no-vault" | "loading" | "not-installed" | "error" | "not-initialized" | "workbench";

type SetupStep = 1 | 2 | 3;

export function AtlasGitPanel({
  vaultPath = null,
  sessionChangeset = null,
  graph = null,
  className,
}: AtlasGitPanelProps) {
  const t = useTranslations("atlasGit");
  const nativeErrors = useNativeErrorLookup();
  /**
   * Turns a `git_fetch` code into the reader's language with `ahead`/`behind` filled in; any
   * other summary, which is git's own output, passes through.
   */
  const remoteSummary = useCallback(
    (summary: string, ahead: number | null, behind: number | null) => {
      if (summary === "remote-no-upstream") return t("summaryNoUpstream");
      if (summary === "remote-in-sync") return t("summaryInSync");
      if (summary === "remote-diverged")
        return t("summaryDiverged", { ahead: ahead ?? 0, behind: behind ?? 0 });
      return summary;
    },
    [t],
  );
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

  /*
   * One workspace read remembered across route changes, so a return arrival does not flash
   * the loading skeleton inside the route crossfade. One unit, so status, diff and history are
   * always from the same read, with `referenceMs` the instant they were read. Keyed on the
   * vault path (`shared/lib/route-arrival-memory.ts`); `refresh()` still runs on every mount.
   */
  const [workspace, rememberWorkspace] = useArrivalMemory<GitWorkspaceMemory | null>(
    vaultPath ? `atlas-git-workspace:${vaultPath}` : null,
    null,
  );
  const status = workspace?.read.status ?? null;
  /**
   * `git_set_remote` just answered ok, and the status read that will say so is still in flight.
   * What git did is known without asking again, so the location line says "never sent" from the
   * same frame as the notice; the read ends it. Kept apart from the remembered workspace read on
   * purpose: that read is one moment's facts, and this is the write's own answer, like the notice
   * beside it.
   */
  const [originJustSaved, setOriginJustSaved] = useState(false);
  /** Where this branch's steps can go — decides what the header and the dock offer. */
  const remoteState = describeRemoteState(
    originJustSaved && status ? { ...status, hasOrigin: true } : status,
  );
  const currentBranch = status?.branch ?? "";
  const changes = workspace?.read.changes ?? NO_CHANGES;
  const diffText = workspace?.read.diffText ?? "";
  const diffTooLarge = workspace?.read.diffTooLarge ?? false;
  const history = workspace?.read.history ?? NO_HISTORY;
  const historyHasMore = workspace?.read.historyHasMore ?? false;
  /*
   * How many steps the person has opened. Remembered per folder like the read itself, so a
   * return trip keeps the depth rather than folding the list back to ten.
   */
  const [historyLimit, setHistoryLimit] = useArrivalMemory<number>(
    vaultPath ? `atlas-git-history-limit:${vaultPath}` : null,
    HISTORY_PAGE,
  );
  /** The depth to read at, as seen from an effect that must not re-run when it changes. */
  const currentHistoryLimit = useEffectEvent(() => historyLimit);
  // The bridge's `relativeTime` is useful only as a compatibility fallback: it
  // is preformatted by git and can therefore arrive in a different language.
  // Capture one reference instant per successful workspace read. Unrelated
  // renders cannot churn wording, while an explicit refresh/snapshot cannot keep
  // formatting against an hours-old mount instant.
  const historyNowMs = workspace?.referenceMs ?? 0;
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
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
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
  /** The concept being viewed inside an expanded step. Collapsing the step clears it. */
  const [focusedConceptId, setFocusedConceptId] = useState<string | null>(null);

  /*
   * Whether git is installed, `null` until known; `git_probe` only tests for an executable, so
   * calling it automatically keeps the charter. Remembered like the workspace read, so a machine
   * without git does not swap screens on every arrival; unkeyed, since it is a fact about the computer.
   */
  const [gitInstalled, setGitInstalled] = useArrivalMemory<boolean | null>(
    "atlas-git-installed",
    null,
  );
  const probeGit = useCallback(async () => {
    try {
      const probe = await gitProbe();
      // No bridge (`null`) means the web path, which is not this state's call to make.
      setGitInstalled(probe === null ? null : probe.installed);
    } catch {
      /*
       * A failed probe does not mean absent: `null` keeps the normal path instead of claiming
       * git is missing, and the catch prevents an unhandled rejection.
       */
      setGitInstalled(null);
    }
  }, [setGitInstalled]);
  const applyInitialProbe = useEffectEvent((probe: Awaited<ReturnType<typeof gitProbe>>) => {
    setGitInstalled(probe === null ? null : probe.installed);
  });
  const reportInitialProbeFailure = useEffectEvent(() => {
    setGitInstalled(null);
  });
  /*
   * Only after a folder is chosen: without one no IPC is needed, and invoking git without the
   * command line tools makes macOS open its install dialog unasked.
   */
  useEffect(() => {
    if (!vaultPath) return;
    let cancelled = false;
    void gitProbe()
      .then((probe) => {
        if (!cancelled) applyInitialProbe(probe);
      })
      .catch(() => {
        if (!cancelled) reportInitialProbeFailure();
      });
    return () => {
      cancelled = true;
    };
  }, [vaultPath]);
  const [loadErrorText, setLoadErrorText] = useState<string | null>(null);

  const [confirming, setConfirmingState] = useState(false);
  const [pushOptIn, setPushOptIn] = useState(false);
  /*
   * The send opt-in belongs to one opened confirm: every close resets it, or a cancelled Push
   * would turn the next plain commit into commit-and-push.
   */
  const setConfirming = useCallback((open: boolean) => {
    setConfirmingState(open);
    if (!open) setPushOptIn(false);
  }, []);
  const [snapshotting, setSnapshotting] = useState(false);
  const [snapshotResult, setSnapshotResult] = useState<GitSnapshotResult | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  /** A save that was asked to send and did not: git's reason, in the reader's language. */
  const snapshotPushFailure = useMemo(() => {
    const push = snapshotResult?.push;
    if (!push || push.pushed) return null;
    return push.message ? gitErrorMessage(push.message, nativeErrors) : push.guidance;
  }, [snapshotResult, nativeErrors]);

  /*
   * The workbench selection, instead of tabs: the list's position already separates
   * uncommitted from committed. `null` lets `selection` below decide from state.
   */
  const [selectionChoice, setSelectionChoice] = useState<WorkbenchSelection | null>(null);

  /** Path of the document chosen in the list; `null` shows every changed concept (overview first). */
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  /** The remote input — opened only from the location line's button; it never sits there as a card. */
  const [remoteOpen, setRemoteOpen] = useState(false);

  const [initRunning, setInitRunning] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [remoteRunning, setRemoteRunning] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [remoteNotice, setRemoteNotice] = useState<string | null>(null);

  const applyWorkspaceRead = useCallback(
    (next: GitWorkspaceRead) => {
      setLoadErrorText(null);
      rememberWorkspace({ read: next, referenceMs: Date.now() });
      setLoadState("ready");
    },
    [rememberWorkspace],
  );
  const reportWorkspaceReadFailure = useCallback((err: unknown) => {
    setLoadErrorText(gitErrorMessage(err, nativeErrors));
    setLoadState("error");
  }, [nativeErrors]);
  /*
   * Reads can now overlap — the watcher, a commit and a click may each start one — and
   * git answers them in whatever order it likes. Only the newest read may land: a status from
   * before a commit arriving after the commit's own read would put the old count back.
   */
  const readSeqRef = useRef(0);
  // Read-only queries (status/diff/history) only — a write (git_snapshot) never happens here.
  const refresh = useCallback(async () => {
    if (!vaultPath) return;
    const seq = ++readSeqRef.current;
    const limit = historyLimit;
    try {
      const next = await readGitWorkspace(vaultPath, limit);
      if (seq !== readSeqRef.current) return;
      if (next) applyWorkspaceRead(next);
    } catch (err) {
      if (seq !== readSeqRef.current) return;
      reportWorkspaceReadFailure(err);
    }
  }, [applyWorkspaceRead, historyLimit, reportWorkspaceReadFailure, vaultPath]);
  const applyInitialWorkspaceRead = useEffectEvent((next: GitWorkspaceRead) => {
    applyWorkspaceRead(next);
  });
  const reportInitialWorkspaceReadFailure = useEffectEvent((err: unknown) => {
    reportWorkspaceReadFailure(err);
  });

  useEffect(() => {
    if (!desktop || !vaultPath) return;
    let cancelled = false;
    const seq = ++readSeqRef.current;
    const limit = currentHistoryLimit();
    void readGitWorkspace(vaultPath, limit)
      .then((next) => {
        if (!cancelled && seq === readSeqRef.current && next) applyInitialWorkspaceRead(next);
      })
      .catch((err) => {
        if (!cancelled && seq === readSeqRef.current) reportInitialWorkspaceReadFailure(err);
      });
    return () => {
      cancelled = true;
    };
  }, [desktop, vaultPath]);

  /**
   * Older steps, one page at a time. The click only raises the depth; the effect below reads
   * the page. Only history is re-read — the status and the diff on screen are still true, and
   * asking for them again would only give the list a reason to blink.
   */
  const loadMoreHistory = useCallback(() => {
    setHistoryLimit(historyLimit + HISTORY_PAGE);
  }, [historyLimit, setHistoryLimit]);
  /**
   * A step a document's history named that the list has not read yet. While set, each landed
   * page is checked for it and the next page is read until it appears.
   */
  const [jumpHash, setJumpHash] = useState<string | null>(null);
  /** Lands a page on the memory **as it is then** — a status read that overlapped is kept. */
  const landHistoryPage = useEffectEvent((page: { history: GitCommitInfo[]; historyHasMore: boolean }) => {
    if (!workspace) return;
    rememberWorkspace({ read: { ...workspace.read, ...page }, referenceMs: Date.now() });
    // A jump still looking for its step reads the next page; found, or no more pages, it ends.
    if (jumpHash === null) return;
    if (page.history.some((commit) => commit.hash === jumpHash) || !page.historyHasMore) {
      setJumpHash(null);
      return;
    }
    setHistoryLimit(historyLimit + HISTORY_PAGE);
  });
  const reportHistoryPageFailure = useEffectEvent((err: unknown) => {
    reportWorkspaceReadFailure(err);
  });
  /*
   * "The list is shorter than the depth asked for, and git has more" is exactly the window in
   * which a page is being read — so it is also the button's busy state, with no second
   * variable to fall out of step.
   */
  const historyShort = Boolean(workspace) && historyHasMore && history.length < historyLimit;
  const historyMoreBusy = historyShort;
  useEffect(() => {
    if (!desktop || !vaultPath || !historyShort) return;
    let cancelled = false;
    void readGitHistoryPage(vaultPath, historyLimit)
      .then((page) => {
        if (!cancelled) landHistoryPage(page);
      })
      .catch((err) => {
        if (!cancelled) reportHistoryPageFailure(err);
      });
    return () => {
      cancelled = true;
    };
  }, [desktop, vaultPath, historyLimit, historyShort]);

  /**
   * The document a jump from its own history is following, and the step it jumped to. Only that
   * step's detail reads it (`CommitDetail`'s `follow`); any other selection ends it.
   */
  const [followed, setFollowed] = useState<(DocumentFollow & { hash: string }) | null>(null);
  /**
   * Jump to a step named by a document's history, reading further pages until its row exists.
   * The focused concept and the document's path go with the jump, or the step would open, and
   * aim its restore door, at its first document instead of the followed one.
   */
  const jumpToCommit = useCallback(
    (hash: string, follow: DocumentFollow) => {
      setSelectionChoice({ kind: "commit", hash });
      setFollowed({ ...follow, hash });
      if (follow.conceptId) setFocusedConceptId(follow.conceptId);
      const loaded = history.some((commit) => commit.hash === hash);
      setJumpHash(loaded ? null : hash);
      if (!loaded && historyHasMore && !historyShort) setHistoryLimit(historyLimit + HISTORY_PAGE);
    },
    [history, historyHasMore, historyShort, historyLimit, setHistoryLimit],
  );
  /** A plain selection from the list ends any jump still reading on, and the follow with it. */
  const selectStep = useCallback((next: WorkbenchSelection) => {
    setSelectionChoice(next);
    setJumpHash(null);
    setFollowed(null);
  }, []);

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
  /*
   * Default: uncommitted changes when they have lines to compare, else the latest commit;
   * new documents alone have none.
   */
  const selection: WorkbenchSelection =
    selectionChoice ??
    (diffFiles.length > 0 || diffTooLarge
      ? { kind: "pending" }
      : history.length > 0
        ? { kind: "commit", hash: history[0].hash }
        : { kind: "pending" });

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

  /**
   * A commit subject the user wrote, so history can say why; an empty string means the
   * automatic subject, as `git_snapshot(message: Option<String>)` expects.
   */
  const [snapshotMessage, setSnapshotMessage] = useState("");

  const confirmSnapshot = useCallback(async () => {
    if (!vaultPath) return;
    setSnapshotting(true);
    setSnapshotError(null);
    try {
      const trimmed = snapshotMessage.trim();
      const result = await gitSnapshot(vaultPath, {
        push: pushOptIn,
        // Ticked on a branch `origin` has never seen, the send is its first: the hint beside
        // the tick says so, and it records where this branch goes from now on.
        ...(pushOptIn && remoteState === "never-sent" ? { setUpstream: true } : {}),
        ...(trimmed ? { message: trimmed } : {}),
      });
      setSnapshotResult(result);
      setConfirming(false);
      setSnapshotMessage("");
      /*
       * After a commit the default selection shows its result: the remaining changes, else the
       * new commit.
       */
      setSelectionChoice(null);
      setSelectedPath(null);
      setFollowed(null);
      await refresh();
    } catch (err) {
      setSnapshotError(gitErrorMessage(err, nativeErrors));
    } finally {
      setSnapshotting(false);
    }
  }, [vaultPath, pushOptIn, remoteState, snapshotMessage, refresh, nativeErrors, setConfirming]);

  /** A copy reports success and failure (`useCopyFeedback`), since clipboard access can be denied silently. */
  const { state: initCopyState, copy: copyInitCommandText } = useCopyFeedback();
  const copyInitCommand = useCallback(
    () => void copyInitCommandText(INIT_CLI_COMMAND),
    [copyInitCommandText],
  );

  /**
   * Start recording, only from a button's onClick, never from mount, focus or refresh (trust
   * charter). Init does not chain into a commit.
   */
  const startTracking = useCallback(async () => {
    if (!vaultPath) return;
    setInitRunning(true);
    setInitError(null);
    try {
      await gitInit(vaultPath);
      await refresh();
    } catch (err) {
      setInitError(gitErrorMessage(err, nativeErrors));
    } finally {
      setInitRunning(false);
    }
  }, [vaultPath, refresh, nativeErrors]);

  /*
   * Fetch, Pull and Push, each only after an explicit click (trust charter); Push also sends
   * existing commits when there is nothing to record.
   */
  const [remoteBusy, setRemoteBusy] = useState<null | RemoteAction>(null);
  const [remoteActionNotice, setRemoteActionNotice] = useState<string | null>(null);
  const [remoteActionError, setRemoteActionError] = useState<string | null>(null);
  /**
   * Put one document back: `HEAD` discards its uncommitted changes, a hash restores that
   * commit's version as an uncommitted change. Only from a confirm button; Rust touches only
   * the named path and refuses what the vault's identity rules would not survive.
   */
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const restoreDocument = useCallback(
    async (relativePath: string, source: string, others: number): Promise<boolean> => {
      if (!vaultPath) return false;
      setRestoreBusy(true);
      setRestoreError(null);
      setRestoreNotice(null);
      try {
        const result = await gitRestoreFile(vaultPath, relativePath, source);
        const path = result?.path ?? relativePath;
        const discard = source === "HEAD";
        const done = discard ? t("discardDone", { path }) : t("restoreDone", { path });
        const rest =
          others > 0
            ? ` ${discard ? t("discardConfirmOthers", { count: others }) : t("restoreDoneOthers", { count: others })}`
            : "";
        setRestoreNotice(`${done}${rest}`);
        if (discard) {
          // A discarded document leaves the pending list; keeping it chosen would point at nothing.
          setSelectedPath(null);
        } else {
          /*
           * Show the result, as after a commit: the uncommitted row with this document chosen.
           */
          setSelectionChoice({ kind: "pending" });
          setSelectedPath(path);
          setJumpHash(null);
          setFollowed(null);
        }
        await refresh();
        return true;
      } catch (err) {
        setRestoreError(`${gitErrorMessage(err, nativeErrors)} ${t("restoreFailedSafe")}`);
        return false;
      } finally {
        setRestoreBusy(false);
      }
    },
    [vaultPath, t, refresh, nativeErrors],
  );

  /*
   * Follow the folder while open by re-reading on each `vault-changed` from the watcher
   * that `TauriVaultWatchBridge` starts. Reads only, so the charter holds. While this side writes, the
   * echo is skipped: the write re-reads when done, and a mid-commit read would show a half state.
   */
  const followBusy = snapshotting || initRunning || remoteRunning || remoteBusy !== null || restoreBusy;
  /*
   * A notice that elapses mid-write is deferred, not dropped: the write's own re-read may miss
   * an edit saved while it ran.
   */
  const missedWhileBusy = useRef(false);
  const followVaultChange = useEffectEvent(() => {
    if (followBusy) {
      missedWhileBusy.current = true;
      return;
    }
    missedWhileBusy.current = false;
    void refresh();
  });
  useEffect(() => {
    if (followBusy || !missedWhileBusy.current) return;
    followVaultChange();
  }, [followBusy]);
  useEffect(() => {
    if (!desktop || !vaultPath) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void listen("vault-changed", () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        if (cancelled) return;
        followVaultChange();
      }, FOLLOW_DEBOUNCE_MS);
    })
      .then((un) => {
        if (cancelled) un();
        else unlisten = un;
      })
      .catch(() => {
        /* No event channel — the next arrival re-reads, exactly as before. */
      });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      unlisten?.();
    };
  }, [desktop, vaultPath]);

  const runRemote = useCallback(
    async (kind: RemoteAction) => {
      if (!vaultPath) return;
      /*
       * Push never commits unconfirmed: `git_snapshot(push:true)` records pending changes first,
       * so with changes Push opens the commit confirm with the send ticked.
       */
      if (kind === "push" && hasChanges) {
        setPushOptIn(true);
        setConfirming(true);
        return;
      }
      setRemoteBusy(kind);
      setRemoteActionError(null);
      setRemoteActionNotice(null);
      let notice: string | null = null;
      let failure: string | null = null;
      try {
        if (kind === "fetch") {
          const r = await gitFetch(vaultPath);
          if (r) notice = t("remoteDoneFetch", { summary: remoteSummary(r.summary, r.ahead, r.behind) });
        } else if (kind === "pull") {
          const r = await gitPull(vaultPath);
          if (r) notice = t("remoteDonePull", { summary: r.summary });
        } else {
          /*
           * Push is `git_snapshot(push:true)`; with nothing to record it returns a
           * no-changes result (`committed:false`) and only sends existing commits.
           */
          /* On a branch `origin` has never seen this is the first send, the only place an upstream is set. */
          const firstSend = remoteState === "never-sent";
          const r = await gitSnapshot(vaultPath, { push: true, ...(firstSend ? { setUpstream: true } : {}) });
          if (r?.push?.pushed)
            notice = firstSend
              ? t("remoteDoneFirstSend", { branch: currentBranch })
              : t("remoteDonePush");
          // The reason first, in the reader's language; the bare git command is the
          // fallback for a push failure Rust had no code for.
          else if (r?.push?.message) failure = gitErrorMessage(r.push.message, nativeErrors);
          else if (r?.push?.guidance) failure = r.push.guidance;
        }
        /* Announced after the re-read, so the notice never stands beside stale counts. */
        await refresh();
      } catch (err) {
        failure = gitErrorMessage(err, nativeErrors);
      } finally {
        setRemoteActionNotice(notice);
        setRemoteActionError(failure);
        setRemoteBusy(null);
      }
    },
    [vaultPath, refresh, t, nativeErrors, remoteSummary, hasChanges, setConfirming, remoteState, currentBranch],
  );

  /** Register a remote: stores the address and never sends; sending is its own press. */
  const submitRemote = useCallback(async () => {
    if (!vaultPath) return;
    setRemoteRunning(true);
    setRemoteError(null);
    setRemoteNotice(null);
    let saved = false;
    try {
      const result = await gitSetRemote(vaultPath, remoteUrl);
      if (result) {
        /*
         * With `origin` saved the form closes and the result speaks from the remote-action line,
         * beside the first send that is now the next step.
         */
        const savedNotice = result.replaced
          ? t("remoteReplaced", { previous: result.replaced })
          : t("remoteSaved");
        setRemoteUrl("");
        setRemoteOpen(false);
        setRemoteActionError(null);
        setRemoteActionNotice(savedNotice);
        setOriginJustSaved(true);
        saved = true;
      }
    } catch (err) {
      setRemoteError(gitErrorMessage(err, nativeErrors));
    } finally {
      // The press ends when git answers, not after the re-read below.
      setRemoteRunning(false);
    }
    if (!saved) return;
    await refresh();
    setOriginJustSaved(false);
  }, [vaultPath, remoteUrl, refresh, t, nativeErrors]);

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
            historyMoreBusy={historyMoreBusy}
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

type Translator = ReturnType<typeof useTranslations<"atlasGit">>;

/**
 * The destination headline, with no close button. `inColumn` drops the full-width divider so
 * the line matches the column; `trailing` is state at the right (the location line); and
 * the `showScope` flag says the recording-scope notice here, which the workbench says in its dock
 * where the write happens.
 */
function PageHeader({
  t,
  inColumn = false,
  showScope = true,
  trailing,
}: {
  t: Translator;
  inColumn?: boolean;
  showScope?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <header
      className={cn(
        "flex shrink-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5",
        inColumn ? "pb-1" : "border-b border-[color:var(--color-border-soft)] px-5 pt-1 pb-4",
      )}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        {/* Ramp utilities only: an arbitrary-length token raises the size but keeps the smaller step's
            leading. The display step matches every destination's h1; the pane's selection headline
            outranks it with `text-hero`. */}
        <h1 className="flex items-center gap-2 text-title font-[var(--font-weight-strong)] tracking-[var(--tracking-title)] text-[color:var(--color-text-primary)] sm:text-display">
          <HistoryIcon size={ICON_SIZE.lg} aria-hidden className="text-[color:var(--color-indigo-text-soft)]" />
          {t("title")}
        </h1>
        {/* The scope notice stands here: nothing outside the folder is touched. */}
        {showScope ? (
          <p className="flex items-center gap-1.5 text-label leading-prose text-[color:var(--color-text-quaternary)]">
            <ShieldCheck size={ICON_SIZE.sm} aria-hidden className="shrink-0" />
            {t("scopeNotice")}
          </p>
        ) : null}
      </div>
      {trailing}
    </header>
  );
}

/**
 * The connect flow: three steps, since a remote is optional and a local-only history is a
 * complete state. Each step has a name and a description on a hairline progress rail; done is
 * an indigo-outlined check, current a filled indigo mark, later neutral.
 */
const LADDER_NOTE_KEY = ["stepAppNote", "stepFolderNote", "stepStartNote"] as const;

function ConnectLadder({ t, current }: { t: Translator; current: SetupStep }) {
  const steps = [t("stepApp"), t("stepFolder"), t("stepStart")];
  return (
    <ol
      data-testid="atlas-git-ladder"
      className="flex flex-col border-l border-[color:var(--color-divider)]"
    >
      {steps.map((label, index) => {
        const step = index + 1;
        const done = step < current;
        const active = step === current;
        return (
          <li
            key={label}
            data-step-state={done ? "done" : active ? "current" : "todo"}
            aria-current={active ? "step" : undefined}
            className="relative grid grid-cols-[24px_minmax(0,1fr)] items-start gap-3 py-2 pl-4"
          >
            {/* Only the current step paints indigo over the existing hairline. */}
            {active ? (
              <span
                aria-hidden
                className="absolute top-0 bottom-0 -left-px w-px bg-[color:var(--color-indigo-accent)]"
              />
            ) : null}
            <span
              aria-hidden
              className={cn(
                // The number is `text-label` (11px). `text-caption` (9.5px)
                // indigo measures 4.55:1 on the canvas, right at the AA
                // threshold (measured). Inside a 24px circle 11px has room, and
                // it is a ramp step, so it is not a new value.
                "grid size-6 shrink-0 place-items-center rounded-full border text-label tabular-nums",
                done
                  ? "border-[color:var(--color-indigo-a46)] text-[color:var(--color-indigo-text-soft)]"
                  : active
                    ? "border-[color:var(--color-indigo-accent)] bg-[color:var(--color-indigo-a16)] text-[color:var(--color-indigo-text-soft)]"
                    : "border-[color:var(--color-border-soft)] text-[color:var(--color-text-quaternary)]",
              )}
            >
              {done ? <Check size={ICON_SIZE.sm} /> : step}
            </span>
            <span className="flex min-w-0 flex-col">
              <span
                className={cn(
                  "truncate text-body font-[var(--font-weight-emphasis)]",
                  active
                    ? "text-[color:var(--color-text-primary)]"
                    : "text-[color:var(--color-text-tertiary)]",
                )}
              >
                {label}
              </span>
              <span className="text-label text-[color:var(--color-text-quaternary)]">
                {done ? t("stepDoneA11y") : t(LADDER_NOTE_KEY[index])}
              </span>
            </span>
            {active ? <span className="sr-only">{t("stepCurrentA11y")}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * A miniature of the connected workbench, so the setup's one request shows what it offers.
 * No data is invented: names are redaction bars, and kinds use `OntologyMapKindGlyph`. The
 * classes `opacity-45` and `aria-hidden` keep it out of assistive technology and the keyboard.
 */
const PREVIEW_ROW_KINDS = [
  "capability",
  "domain",
  "element",
  "capability",
  "element",
  "capability",
] as const;
/** Satellite coordinates (%) on the four `EGO_BEARINGS`, the real layout of the ego drawing. */
const PREVIEW_SATELLITES = [
  { x: 50, y: 14, kind: "domain" },
  { x: 86, y: 50, kind: "element" },
  { x: 50, y: 86, kind: "capability" },
  { x: 14, y: 50, kind: "element" },
] as const;

function SetupPreview({ t }: { t: Translator }) {
  return (
    <div className="hidden min-w-0 flex-col gap-3 lg:flex">
      <div
        aria-hidden
        data-testid="atlas-git-setup-preview"
        className="overflow-hidden rounded-[var(--radius-panel)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] opacity-45"
      >
        <div className="flex items-center gap-2 border-b border-[color:var(--color-divider)] px-3 py-2">
          <span className="h-1.5 w-24 rounded-full bg-[color:var(--color-overlay-3)]" />
          <span className="ml-auto h-4 w-10 rounded-[var(--radius-chip)] border border-[color:var(--color-border-soft)]" />
        </div>
        {/* Between `lg` and `xl` only the timeline survives — forcing two cells
            into a narrow width gives a mangled diagram, not a smaller one. */}
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="flex flex-col py-1.5 xl:border-r xl:border-[color:var(--color-divider)]">
            <span className="flex h-[var(--git-row-h)] items-center gap-2 border-l-2 border-dashed border-l-[color:var(--color-indigo-a46)] pr-3 pl-2.5">
              <span className="h-1.5 w-8 rounded-full bg-[color:var(--color-overlay-2)]" />
              <span className="h-1.5 flex-1 rounded-full bg-[color:var(--color-overlay-3)]" />
            </span>
            {PREVIEW_ROW_KINDS.map((kind, index) => (
              <span
                key={`${kind}-${String(index)}`}
                className={cn(
                  "flex h-[var(--git-row-h)] items-center gap-2 border-l-2 pr-3 pl-2.5",
                  index === 0
                    ? "border-l-[color:var(--color-indigo-brand)] bg-[color:var(--color-overlay-2)]"
                    : "border-l-transparent",
                )}
              >
                <span className="h-1.5 w-6 rounded-full bg-[color:var(--color-overlay-2)]" />
                <OntologyMapKindGlyph kind={kind} size={11} />
                <span
                  className="h-1.5 rounded-full bg-[color:var(--color-overlay-3)]"
                  style={{ width: `${String(46 + index * 9)}%` }}
                />
              </span>
            ))}
          </div>
          <div className="hidden min-w-0 flex-col gap-2.5 p-3 xl:flex">
            <span className="h-1.5 w-2/3 rounded-full bg-[color:var(--color-overlay-3)]" />
            {/* Bars, not words: no ink passes AA at `opacity-45`. The caption step stays for its
                leading, which sets the chip height. */}
            <div className="flex flex-wrap gap-1.5">
              {(["capability", "element"] as const).map((kind) => (
                <span
                  key={kind}
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius-chip)] border border-[color:var(--color-border-soft)] px-1.5 py-0.5 text-caption"
                >
                  <OntologyMapKindGlyph kind={kind} size={9} />
                  <span className="h-1.5 w-4 rounded-full bg-[color:var(--color-overlay-3)]" />
                </span>
              ))}
            </div>
            <div className="relative h-32 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-canvas)]">
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 h-full w-full"
              >
                {PREVIEW_SATELLITES.map((s) => (
                  <line
                    key={`${String(s.x)}-${String(s.y)}-${s.kind}`}
                    x1="50"
                    y1="50"
                    x2={s.x}
                    y2={s.y}
                    stroke="var(--map-edge-contains)"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>
              <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color:var(--color-canvas)] p-1">
                <OntologyMapKindGlyph kind="capability" size={17} />
              </span>
              {PREVIEW_SATELLITES.map((s) => (
                <span
                  key={`g-${String(s.x)}-${String(s.y)}`}
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color:var(--color-canvas)] p-1"
                  style={{ left: `${String(s.x)}%`, top: `${String(s.y)}%` }}
                >
                  <OntologyMapKindGlyph kind={s.kind} size={11} />
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
      <p className="text-center text-label text-[color:var(--color-text-quaternary)]">
        {t("previewCaption")}
      </p>
    </div>
  );
}

/**
 * The setup stage every not-yet-recording state shares, centred: the telling cell
 * (`--git-setup-measure`) with the task as the display-size h1, and from `xl` the showing cell
 * (`SetupPreview`) of what the screen becomes. It enters with `.topology-chrome-in`, whose
 * reduced-motion equivalent comes from the globals base layer.
 */
function SetupFrame({
  t,
  step,
  state,
  title,
  body,
  note,
  children,
}: {
  t: Translator;
  /** `null` skips the connect flow (loading and error are events, not steps). */
  step: SetupStep | null;
  state: string;
  /** This moment's task in one sentence — the screen's h1. */
  title: string;
  body?: string;
  /** The promise on the last line, by default the recording-scope notice, just before the action. */
  note?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      data-testid="atlas-git-setup"
      data-setup-state={state}
      className="topology-chrome-in grid w-full flex-1 grid-cols-1 content-center items-center gap-9 py-[var(--git-setup-top)] lg:grid-cols-[minmax(0,var(--git-setup-measure))_minmax(0,var(--git-setup-preview-max))] lg:justify-center lg:gap-10 xl:gap-14"
    >
      {/* Capped at the prose measure at every width, or below `lg` the divider and CLI line stretch. */}
      <div className="flex min-w-0 max-w-[var(--git-setup-measure)] flex-col gap-5">
        {/* The destination name is an eyebrow; the h1 is the task at hand. */}
        <p className="flex items-center gap-2 text-label text-[color:var(--color-text-quaternary)]">
          <HistoryIcon size={ICON_SIZE.sm} aria-hidden className="text-[color:var(--color-indigo-text-soft)]" />
          {t("title")}
        </p>
        <div className="flex flex-col gap-2">
          <h1 className="text-display font-[var(--font-weight-strong)] tracking-[var(--tracking-card)] text-[color:var(--color-text-primary)]">
            {title}
          </h1>
          {body ? (
            <p className="max-w-[34em] text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">
              {body}
            </p>
          ) : null}
        </div>
        {step ? <ConnectLadder t={t} current={step} /> : null}
        {children}
        {note ? (
          <p className="flex items-start gap-2 text-label leading-prose text-[color:var(--color-text-quaternary)]">
            <ShieldCheck size={ICON_SIZE.sm} aria-hidden className="mt-0.5 shrink-0" />
            <span>{note}</span>
          </p>
        ) : null}
      </div>
      <SetupPreview t={t} />
    </div>
  );
}

/**
 * What changed this session, independent of git: `computeOntologyChangeset` against the
 * per-vault `change-baseline-store` baseline, which survives a reload. Shown on desktop and web.
 */
function SessionChangeSummary({
  t,
  changeset,
  title,
}: {
  t: Translator;
  changeset: OntologyChangeset | null;
  /** Section title — web and desktop use different wording. */
  title: string;
}) {
  const rows = changeset
    ? (
        [
          ["webNodesAdded", changeset.addedNodes.length],
          ["webNodesChanged", changeset.changedNodes.length],
          ["webNodesRemoved", changeset.removedNodes.length],
          ["webEdgesAdded", changeset.addedEdges.length],
          ["webEdgesRemoved", changeset.removedEdges.length],
        ] as const
      ).filter(([, count]) => count > 0)
    : [];
  return (
    <div
      data-testid="atlas-git-session-changes"
      className="flex flex-col gap-1.5 border-t border-[color:var(--color-divider)] pt-4"
    >
      <SectionLabel>{title}</SectionLabel>
      {rows.length > 0 ? (
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <li aria-hidden className="flex items-center">
            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-status-warning)]" />
          </li>
          {rows.map(([key, count]) => (
            <li key={key} className="text-body text-[color:var(--color-text-secondary)]">
              {t(key, { count })}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body text-[color:var(--color-text-quaternary)]">{t("webNoChanges")}</p>
      )}
    </div>
  );
}

function WebSetup({
  t,
  sessionChangeset,
}: {
  t: Translator;
  sessionChangeset: OntologyChangeset | null;
}) {
  return (
    <SetupFrame
      t={t}
      step={1}
      state="web"
      title={t("webTitle")}
      body={t("webDesktopHint")}
      note={t("scopeNotice")}
    >
      <Link
        href="/download"
        data-testid="atlas-git-web-get-app"
        className={cn(PRIMARY_ACTION_CLASS, "self-start")}
      >
        <Download size={ICON_SIZE.sm} aria-hidden />
        {t("webGetApp")}
      </Link>

      {/* What changed this time — the **basis** for the action, so it sits below the primary action. */}
      <SessionChangeSummary t={t} changeset={sessionChangeset} title={t("webSummaryTitle")} />

      {/*
       * No CLI escape here: it needs a source checkout, and plain `git commit` already works.
       * The degradation card (`surfaces.md`) is complete: why in the body, where in `/download`,
       * what works here in the session summary below.
       */}
    </SetupFrame>
  );
}

/** The app is open without a folder: the next step is choosing one, never getting the app. */
function NoVaultSetup({ t }: { t: Translator }) {
  return (
    <SetupFrame
      t={t}
      step={2}
      state="no-vault"
      title={t("noVaultTitle")}
      body={t("noVaultBody")}
      note={t("scopeNotice")}
    >
      <Link
        href="/docs"
        data-testid="atlas-git-pick-vault"
        className={cn(PRIMARY_ACTION_CLASS, "self-start")}
      >
        <FolderOpen size={ICON_SIZE.sm} aria-hidden />
        {t("noVaultAction")}
      </Link>
    </SetupFrame>
  );
}


/**
 * One remote action: the label in the reader's locale, and a tooltip, opening on focus as well
 * as hover, with what it does and the git verb it runs.
 */
function RemoteActionButton({
  id,
  label,
  hint,
  command = `git ${id}`,
  busy,
  disabled,
  onClick,
}: {
  id: RemoteAction;
  label: string;
  hint: string;
  /** The git command the press runs, shown under the hint; the verb itself by default. */
  command?: string;
  busy: boolean;
  disabled: boolean;
  onClick: (kind: RemoteAction) => void;
}) {
  return (
    <Tooltip
      side="bottom"
      align="end"
      // The hint opens across the "now / uncommitted changes" row below the button and holds
      // nothing to press, so it never takes the pointer, or it would swallow clicks on that row.
      panelClassName="pointer-events-none"
      content={
        <span className="flex flex-col gap-0.5" data-testid={`atlas-git-remote-${id}-hint`}>
          <span>{hint}</span>
          <span className="font-mono text-[color:var(--color-text-tertiary)]">{command}</span>
        </span>
      }
    >
    <button
      type="button"
      data-testid={`atlas-git-remote-${id}`}
      disabled={disabled}
      onClick={() => onClick(id)}
      /*
       * Visibly pressable, since these reach the remote and are the hardest to undo; `lg`
       * matches the commit confirm pair Push opens.
       */
      className={controlClass({
        shape: "chip",
        size: "lg",
        tone: "secondary",
        className:
          "font-[var(--font-weight-signature)] border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)] hover:border-[color:var(--color-indigo-a46)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] disabled:border-[color:var(--color-border-soft)] disabled:bg-transparent disabled:text-[color:var(--color-text-quaternary)]",
      })}
    >
      {busy ? "…" : label}
    </button>
    </Tooltip>
  );
}

/**
 * The location line: where this folder's steps go, as one chrome line at the header's right
 * with a quiet action; the remote input opens only when pressed. Not a railed callout card,
 * which `design.md` forbids.
 */
function LocationLine({
  t,
  branch,
  upstream,
  remoteState,
  headShortHash,
  ahead,
  behind,
  remoteOpen,
  setRemoteOpen,
  remoteBusy,
  onRemoteAction,
  pendingCount,
}: {
  t: Translator;
  /** Uncommitted changes. Above zero, Push opens the commit confirm step first. */
  pendingCount: number;
  branch: string | null;
  upstream: string | null;
  /** Where this branch's steps can go; everything right of the location follows from it. */
  remoteState: GitRemoteState;
  /** The commit a detached HEAD names — shown in place of the `HEAD` git reports as the branch. */
  headShortHash: string | null;
  /** With no upstream both are null — that is "unknown", not 0. */
  ahead: number | null;
  behind: number | null;
  remoteOpen: boolean;
  setRemoteOpen: (v: boolean) => void;
  remoteBusy: null | RemoteAction;
  onRemoteAction: (kind: RemoteAction) => void;
}) {
  if (!branch) return null;
  const known = ahead !== null && behind !== null;
  const same = known && ahead === 0 && behind === 0;
  const detachedAt = remoteState === "detached" ? headShortHash : null;
  return (
    <div
      data-testid="atlas-git-location"
      className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-label text-[color:var(--color-text-quaternary)]"
    >
      {/*
        Branch and remote names are the user's own, untranslated. Ahead and behind counts sit on
        the Push and Pull buttons they justify.
      */}
      {/*
        Branch, tracking arrow and upstream are one fact, drawn as one `tag` badge (`badgeClass`).
      */}
      <span
        data-testid="atlas-git-location-ref"
        className={badgeClass({
          shape: 'tag',
          className:
            'flex min-w-0 items-center gap-1.5 border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] font-mono',
        })}
      >
        {/* A detached HEAD has no branch name; git's `HEAD` says nothing, the commit does. */}
        <span className="truncate text-[color:var(--color-text-secondary)]">{detachedAt ?? branch}</span>
        {upstream ? (
          <>
            {/* The arrow is not decoration but a **tracking relation** — the left follows the right. */}
            <span aria-hidden className="shrink-0 text-[color:var(--color-text-quaternary)]">
              →
            </span>
            <span className="truncate text-[color:var(--color-text-quaternary)]">
              {upstream}
            </span>
          </>
        ) : null}
      </span>
      {/*
        Keyed apart, or React reuses the pressed first-send button as Pull and a second Enter pulls.
      */}
      {upstream ? (
        <Fragment key="tracked">
          {/* "identical" appears only when there are no numbers — it says why both buttons are disabled. */}
          {same ? (
            <span
              data-testid="atlas-git-divergence"
              title={t("remoteStale")}
              className={badgeClass({
                shape: 'tag',
                className:
                  'shrink-0 border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] text-[color:var(--color-text-quaternary)]',
              })}
            >
              {t("divergeSame")}
            </span>
          ) : (
            <span data-testid="atlas-git-divergence" className="sr-only">
              {t("divergeAhead", { ahead: ahead ?? 0 })}{" "}
              {t("divergeBehind", { behind: behind ?? 0 })}
            </span>
          )}
          {/* Fetch, Pull and Push keep the git terms; translating them blurs what happens. */}
          <RemoteActionButton
            id="fetch"
            label={t("remoteFetch")}
            hint={t("remoteFetchHint")}
            busy={remoteBusy === "fetch"}
            disabled={remoteBusy !== null}
            onClick={onRemoteAction}
          />
          <RemoteActionButton
            id="pull"
            label={behind && behind > 0 ? `${t("remotePull")} ${behind}` : t("remotePull")}
            hint={behind && behind > 0 ? t("remotePullHint", { behind }) : t("remoteSameHint")}
            busy={remoteBusy === "pull"}
            disabled={remoteBusy !== null}
            onClick={onRemoteAction}
          />
          <RemoteActionButton
            id="push"
            label={ahead && ahead > 0 ? `${t("remotePush")} ${ahead}` : t("remotePush")}
            hint={
              pendingCount > 0
                ? t("remotePushCommitsFirstHint", { count: pendingCount })
                : ahead && ahead > 0
                  ? t("remotePushHint", { ahead })
                  : t("remoteSameHint")
            }
            busy={remoteBusy === "push"}
            disabled={remoteBusy !== null}
            onClick={onRemoteAction}
          />
        </Fragment>
      ) : remoteState === "no-remote" ? (
        <Fragment key="no-remote">
          <span aria-hidden>·</span>
          <span data-testid="atlas-git-remote-state" data-remote-state={remoteState}>
            {t("noUpstream")}
          </span>
          <button
            type="button"
            data-testid="atlas-git-remote-toggle"
            aria-expanded={remoteOpen}
            onClick={() => setRemoteOpen(!remoteOpen)}
            className={controlClass({
              // `lg`, the size of the remote actions that take this slot in the other states:
              // one type size in the row.
              shape: "chip",
              size: "lg",
              className:
                "border-[color:var(--color-border-soft)] hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]",
            })}
          >
            {remoteOpen ? t("remoteToggleClose") : t("remoteToggle")}
          </button>
        </Fragment>
      ) : remoteState === "never-sent" ? (
        <Fragment key="never-sent">
          <span aria-hidden>·</span>
          <span data-testid="atlas-git-remote-state" data-remote-state={remoteState}>
            {t("neverSent")}
          </span>
          {/*
            The first send, and the only place an upstream is set: the hint names the branch,
            the destination and that it goes only on this press, and the line under it is the
            command it amounts to (git.rs runs `push --set-upstream origin HEAD`). With
            uncommitted changes it opens the commit confirm first, like Push.
          */}
          <RemoteActionButton
            id="push"
            label={t("remotePush")}
            hint={
              pendingCount > 0
                ? t("remotePushCommitsFirstHint", { count: pendingCount })
                : t("sendBranchHint", { branch })
            }
            command={`git push -u origin ${branch}`}
            busy={remoteBusy === "push"}
            disabled={remoteBusy !== null}
            onClick={onRemoteAction}
          />
        </Fragment>
      ) : (
        <Fragment key="no-send">
          <span aria-hidden>·</span>
          {/* Detached or unknown: a fact, and no button — neither state has a send to offer,
              and neither may reach the form that rewrites `origin`. */}
          <span data-testid="atlas-git-remote-state" data-remote-state={remoteState}>
            {remoteState === "detached" ? t("detachedHead") : t("upstreamUnknown")}
          </span>
        </Fragment>
      )}
    </div>
  );
}

/**
 * A one-line result for a remote action, outside the top bar so a result never moves the
 * buttons under the pointer.
 */
function RemoteResultLine({
  notice,
  error,
  kind = "remote",
}: {
  notice: string | null;
  error: string | null;
  /** Which action the line reports; only the test id differs. */
  kind?: "remote" | "restore";
}) {
  const ref = useRef<HTMLParagraphElement | null>(null);
  const text = error ?? notice;
  /*
   * When the pressed button leaves with its result (a first send), the result takes focus
   * instead of `<body>`; a button still present keeps it.
   */
  useEffect(() => {
    if (!text || typeof document === "undefined") return;
    const active = document.activeElement;
    if (!active || active === document.body) ref.current?.focus({ preventScroll: true });
  }, [text]);
  if (!text) return null;
  return (
    <p
      ref={ref}
      tabIndex={-1}
      role="status"
      data-testid={error ? `atlas-git-${kind}-error` : `atlas-git-${kind}-notice`}
      className={cn(
        "git-fade-in flex-none border-b border-[color:var(--color-divider)] px-4 py-2 text-label leading-prose outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-focus-ring)]",
        error
          ? "text-[color:var(--color-danger-text)]"
          : "text-[color:var(--color-text-tertiary)]",
      )}
    >
      {text}
    </p>
  );
}

/**
 * Registering a remote, opened from the location line; optional, not a connect step. Only the
 * typed address is used, never a guess (trust charter), and saving it sends nothing.
 */
function RemoteSetup({
  t,
  remoteUrl,
  setRemoteUrl,
  remoteRunning,
  remoteError,
  remoteNotice,
  onSubmit,
}: {
  t: Translator;
  remoteUrl: string;
  setRemoteUrl: (v: string) => void;
  remoteRunning: boolean;
  remoteError: string | null;
  remoteNotice: string | null;
  onSubmit: () => void;
}) {
  return (
    <div
      data-testid="atlas-git-remote-setup"
      className="git-fade-in flex shrink-0 flex-col gap-2 rounded-[var(--radius-card)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-3"
    >
      <p className="text-label leading-prose text-[color:var(--color-text-tertiary)]">
        {t("remoteSetupBody")}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={remoteUrl}
          aria-label={t("remoteFieldLabel")}
          placeholder={t("remoteFieldPlaceholder")}
          data-testid="atlas-git-remote-input"
          onChange={(event) => setRemoteUrl(event.target.value)}
          className={fieldClass({ size: "md", className: "min-w-[220px] flex-1 font-mono text-label" })}
        />
        <button
          type="button"
          data-testid="atlas-git-remote-submit"
          disabled={remoteRunning || remoteUrl.trim() === ""}
          onClick={onSubmit}
          className={controlClass({
            tone: "onAccent",
            className: "hover:bg-[color:var(--color-indigo-brand-hover)]",
          })}
        >
          {remoteRunning ? t("remoteRunning") : t("remoteSubmit")}
        </button>
      </div>
      {remoteError ? (
        <div className="git-fade-in flex flex-col gap-0.5" data-testid="atlas-git-remote-error">
          <p className="text-label text-[color:var(--color-danger-text)]">{remoteError}</p>
          {/* Say every time that the data is safe even on failure. */}
          <p className="text-caption text-[color:var(--color-text-quaternary)]">
            {t("remoteFailedSafe")}
          </p>
        </div>
      ) : null}
      {remoteNotice ? (
        <p
          className="git-fade-in text-label text-[color:var(--color-text-secondary)]"
          data-testid="atlas-git-remote-notice"
        >
          {remoteNotice}
        </p>
      ) : null}
      <p className="text-caption text-[color:var(--color-text-quaternary)]">{t("remoteHelp")}</p>
    </div>
  );
}

/** Stagger cap — the first 8 rows arrive in order and everything after shares one frame. */
const MAX_STAGGER_INDEX = 8;

function staggerStyle(index: number): React.CSSProperties {
  return { "--git-row-index": Math.min(index, MAX_STAGGER_INDEX) } as React.CSSProperties;
}

/**
 * Discard one document's uncommitted changes. Worded apart from restore: git holds no copy, so
 * nothing brings them back. The count comes from the parsed diff on screen.
 */
function DiscardDock({
  t,
  path,
  status,
  delta,
  others,
  busy,
  onDiscard,
}: {
  t: Translator;
  path: string;
  status: string;
  delta: { added: number; removed: number } | null;
  /** Uncommitted documents that stay untouched — the residue a person must know. */
  others: number;
  busy: boolean;
  onDiscard: (path: string, others: number) => Promise<boolean>;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-2" data-testid="atlas-git-discard-dock">
      <DocumentConfirmStep
        testIdPrefix="atlas-git-discard"
        doorLabel={t("discardAction")}
        confirmLabel={t("discardButton")}
        busyLabel={t("discardRunning")}
        cancelLabel={t("cancelButton")}
        tone="danger"
        busy={busy}
        onConfirm={() => onDiscard(path, others)}
      >
        <p className="text-label leading-prose text-[color:var(--color-text-secondary)]">
          {status === "deleted"
            ? t("discardConfirmDeleted")
            : t("discardConfirmBody", { added: delta?.added ?? 0, removed: delta?.removed ?? 0 })}
        </p>
        <p className="text-caption leading-label text-[color:var(--color-text-quaternary)]">
          {t("discardConfirmOthers", { count: others })}
        </p>
      </DocumentConfirmStep>
    </div>
  );
}

const STEP_CONCEPT_SLOTS = 2;

/**
 * A step's concept names, as many as fit whole: two only when there are exactly two and both
 * fit on the painted row (measured, since the column follows the window), else one whole name
 * and a count.
 */
function StepConceptNames({
  concepts,
  more,
}: {
  concepts: readonly { id: string; label: string; kind: string }[];
  more: (count: number) => string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const lastWidth = useRef(0);
  const pair = concepts.length === STEP_CONCEPT_SLOTS;
  useLayoutEffect(() => {
    if (!pair || collapsed || !ref.current) return;
    const cut = [...ref.current.querySelectorAll<HTMLElement>("[data-step-concept-name]")].some(
      (name) => name.scrollWidth > name.clientWidth + 1,
    );
    // A truncation is only knowable after layout; switching before paint keeps the cut pair
    // from ever showing.
    if (cut) setCollapsed(true);
  }, [pair, collapsed, concepts]);
  useEffect(() => {
    const node = ref.current;
    if (!pair || !node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width);
      if (lastWidth.current && width > lastWidth.current + 8) setCollapsed(false);
      lastWidth.current = width;
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [pair]);
  const slots = concepts.length > STEP_CONCEPT_SLOTS || collapsed ? 1 : STEP_CONCEPT_SLOTS;
  return (
    <span ref={ref} className="flex min-w-0 flex-1 items-center gap-2.5">
      {concepts.slice(0, slots).map((concept) => (
        <span key={concept.id} className="inline-flex min-w-0 shrink items-center gap-1.5">
          <OntologyMapKindGlyph kind={concept.kind} size={12} />
          <span className="truncate" title={concept.label} data-step-concept-name="">{concept.label}</span>
        </span>
      ))}
      {concepts.length > slots ? (
        <span
          className="shrink-0 text-label font-normal text-[color:var(--color-text-quaternary)]"
          title={concepts.slice(slots).map((concept) => concept.label).join(", ")}
        >
          {more(concepts.length - slots)}
        </span>
      ) : null}
    </span>
  );
}

/**
 * The step list's scroll box: while it has room for another row and older steps exist it
 * reads the next page itself, so it is never half empty.
 */
function StepListScroller({
  hasMore,
  busy,
  onMore,
  className,
  children,
}: {
  hasMore: boolean;
  busy: boolean;
  onMore: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [roomy, setRoomy] = useState(false);
  /*
   * Which edges hide rows; each such edge fades by `--tabbar-edge-fade`, the mask other
   * scrolling lists use, so hidden rows are visible as such.
   */
  const [edge, setEdge] = useState({ top: false, bottom: false });
  const readEdge = useCallback(() => {
    const el = ref.current;
    if (!el || el.clientHeight < 1) return;
    const top = el.scrollTop > 1;
    const bottom = el.scrollHeight - el.clientHeight - el.scrollTop > 1;
    setEdge((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const read = () => {
      readEdge();
      // An unmeasured box (a test DOM, a hidden panel) has no room to fill.
      if (el.clientHeight < 1) return setRoomy(false);
      const rowHeightPx = Number.parseFloat(getComputedStyle(el).getPropertyValue("--git-row-h")) || 40;
      setRoomy(el.scrollHeight - el.clientHeight < rowHeightPx);
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    const list = el.firstElementChild;
    if (list) observer.observe(list);
    return () => observer.disconnect();
  }, [readEdge]);
  useEffect(() => {
    if (roomy && hasMore && !busy) onMore();
  }, [roomy, hasMore, busy, onMore]);
  const fade = "var(--tabbar-edge-fade)";
  const mask =
    edge.top && edge.bottom
      ? `linear-gradient(to bottom, transparent 0, black ${fade}, black calc(100% - ${fade}), transparent 100%)`
      : edge.bottom
        ? `linear-gradient(to bottom, black calc(100% - ${fade}), transparent 100%)`
        : edge.top
          ? `linear-gradient(to bottom, transparent 0, black ${fade})`
          : undefined;
  return (
    <div
      ref={ref}
      data-testid="atlas-git-steps-scroll"
      data-edge-bottom={edge.bottom ? "true" : undefined}
      onScroll={readEdge}
      style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
      className={cn("min-h-0 max-xl:overflow-y-auto xl:flex-1 xl:overflow-y-auto", className)}
    >
      {children}
    </div>
  );
}

/**
 * One list row: a full-width table row whose 2px indigo edge marks selection (not a railed
 * card, which `design.md` forbids). Columns are time, name and why; below `xl` the why drops
 * under the name so a wide row does not split into islands.
 */
const STEP_ROW =
  "grid w-full grid-cols-[var(--git-when-w)_minmax(0,1fr)] xl:grid-cols-[var(--git-when-w)_minmax(0,1.7fr)_minmax(0,1fr)] min-h-[var(--git-row-h)] items-center gap-x-3 gap-y-0.5 xl:gap-y-3 border-b border-l-2 border-b-[color:var(--color-divider)] px-4 py-2 text-left transition-colors hover:bg-[color:var(--color-overlay-1)] max-xl:[&>*:first-child]:row-span-2 max-xl:[&>*:nth-child(3)]:col-start-2";

function StepList({
  t,
  history,
  hasMore,
  moreBusy,
  onMore,
  concepts,
  settledHash,
  pendingCount,
  selection,
  setSelection,
  ahead,
  behind,
  upstream,
  onRemoteAction,
}: {
  t: Translator;
  history: GitCommitInfo[];
  /** Older steps exist beyond the list — the list ends with a row that fetches them, never silently. */
  hasMore: boolean;
  moreBusy: boolean;
  onMore: () => void;
  /** Step hash → the vault concepts it changed, from per-commit kind and slug matched to the graph. */
  concepts: ReadonlyMap<string, readonly { id: string; label: string; kind: string }[]>;
  /** Hash of the commit just recorded — only that one row gets the settle ramp. */
  settledHash?: string | null;
  /** Number of uncommitted changes; at 0 the row is not drawn. */
  pendingCount: number;
  selection: WorkbenchSelection;
  setSelection: (v: WorkbenchSelection) => void;
  /** Number of steps not yet pushed — they are the top N of the list. */
  ahead: number | null;
  /** Steps that exist only on the remote. They are not in local history, so this is **guidance, not a row**. */
  behind: number | null;
  upstream: string | null;
  onRemoteAction: (kind: "fetch" | "pull" | "push") => void;
}) {
  /*
   * A jump from a document's history can select a row far below the fold. The row is the
   * proof that the selection landed, so it is brought into view; `nearest` never moves a row
   * that is already visible, so an ordinary click does not scroll.
   */
  const revealSelectedRow = useCallback((node: HTMLButtonElement | null) => {
    if (node && typeof node.scrollIntoView === "function") node.scrollIntoView({ block: "nearest" });
  }, []);
  /*
   * One tab stop with arrows between rows, the Library lists' hook; Enter or Space is the row's
   * click, so selection stays a deliberate press.
   */
  const rowCount =
    (behind && behind > 0 ? 1 : 0) + (pendingCount > 0 ? 1 : 0) + history.length + (hasMore ? 1 : 0);
  const listRef = useRef<HTMLUListElement | null>(null);
  const roving = useRovingRows({ count: rowCount, listRef });
  let rowIndex = 0;
  const rowProps = () => {
    const index = rowIndex++;
    return {
      "data-row-index": index,
      tabIndex: roving.tabIndexOf(index),
      onFocus: () => roving.onRowFocus(index),
    };
  };
  if (history.length === 0) {
    return (
      <div className="flex flex-col gap-1 px-4 py-3">
        <p className="text-label text-[color:var(--color-text-tertiary)]">{t("historyEmpty")}</p>
        <p className="text-caption leading-label text-[color:var(--color-text-quaternary)]">
          {t("historyEmptyHint")}
        </p>
      </div>
    );
  }

  /*
   * No tabs: remote-only, uncommitted and unpushed are stretches of one timeline, separated
   * by boundaries (a test holds that history never hides behind a tab).
   *
   *   [remote only ↓N]     ← not local, so guidance plus fetch rather than a row
   *   [now · uncommitted]  ← a change bundle that has no name yet
   *   ── not yet pushed N ──
   *     step · step
   *   ── level with origin/main ──
   *     step · step …
   */
  const unpushed = Math.max(0, Math.min(ahead ?? 0, history.length));

  return (
    <ul data-testid="atlas-git-steps" className="flex flex-col" ref={listRef} onKeyDown={roving.onKeyDown}>
      {behind && behind > 0 ? (
        <li>
          <button
            type="button"
            data-testid="atlas-git-behind-row"
            {...rowProps()}
            onClick={() => onRemoteAction("pull")}
            className={cn(STEP_ROW, "border-l-transparent")}
          >
            <span className="truncate text-label text-[color:var(--color-text-tertiary)]">
              {t("remoteOnlyWhen")}
            </span>
            <span className="truncate text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
              {t("remoteOnlyTitle", { count: behind })}
            </span>
            <span className="truncate text-label text-[color:var(--color-text-tertiary)]">
              {t("remoteOnlyHint")}
            </span>
          </button>
        </li>
      ) : null}
      {/* Uncommitted changes use the commit row grammar, marked by a dashed line and "now". */}
      {pendingCount > 0 ? (
        <li>
          <button
            type="button"
            data-testid="atlas-git-pending-row"
            {...rowProps()}
            /*
             * The `aria-current` attribute, not pressed: this row marks what the detail shows, and
             * the sibling rows already use `aria-expanded`.
             */
            aria-current={selection.kind === "pending" ? "true" : undefined}
            onClick={() => setSelection({ kind: "pending" })}
            className={cn(STEP_ROW, "border-l-dashed border-l-[color:var(--color-indigo-a46)] aria-[current=true]:border-l-[color:var(--color-indigo-brand)] aria-[current=true]:bg-[color:var(--color-overlay-2)]")}
          >
            <span className="truncate text-label tabular-nums text-[color:var(--color-text-tertiary)]">
              {t("pendingNow")}
            </span>
            <span className="truncate text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
              {t("changesTitle")}
            </span>
            {/* Tertiary ink, since quaternary on a selected row's overlay-2 falls below contrast. */}
            <span className="truncate text-label text-[color:var(--color-text-tertiary)]">
              {t("pendingHint", { count: pendingCount })}
            </span>
          </button>
        </li>
      ) : null}
      {history.map((commit, index) => {
        const summary = describeSnapshotSubject(commit.subject);
        const human = humanizeStepSubject(t, commit.subject);
        const headline = human ?? stripConventionalPrefix(commit.subject);
        /*
         * The why column: a person's subject, or for an automatic subject its counts in the
         * reader's language instead of the raw snapshot string.
         */
        const why = human ? t("stepAutoSubject", { summary: human }) : stripConventionalPrefix(commit.subject);
        const stepConcepts = concepts.get(commit.hash) ?? [];
        const names = summary.slugs.join(", ");
        const trail = summary.overflow > 0 ? t("moreSlugs", { count: summary.overflow }) : "";
        const expanded = selection.kind === "commit" && selection.hash === commit.hash;
        // There are **two** boundaries: the head of the unpushed stretch, and the point it draws level with the remote.
        const boundary =
          unpushed > 0 && index === 0
            ? t("sectionUnpushed", { count: unpushed })
            : unpushed > 0 && index === unpushed
              ? t("sectionSynced", { upstream: upstream ?? "" })
              : null;
        return (
          <Fragment key={`row-${commit.hash}`}>
          {boundary ? (
            <li
              aria-hidden
              data-testid="atlas-git-section"
              className="flex items-center gap-2.5 px-4 pt-3 pb-1.5 text-caption text-[color:var(--color-text-quaternary)]"
            >
              <span className="truncate">{boundary}</span>
              <i className="h-px min-w-4 flex-1 bg-[color:var(--color-divider)]" />
            </li>
          ) : null}
          <li
            className={stepRowMotionClass(commit.hash, settledHash)}
            style={stepRowUsesStagger(commit.hash, settledHash) ? staggerStyle(index) : undefined}
          >
            <button
              type="button"
              data-testid="atlas-git-history-item"
              {...rowProps()}
              ref={expanded ? revealSelectedRow : undefined}
              aria-expanded={expanded}
              title={t("stepSelectHint")}
              onClick={() => setSelection({ kind: "commit", hash: commit.hash })}
              className={cn(STEP_ROW, "border-l-transparent aria-expanded:border-l-[color:var(--color-indigo-brand)] aria-expanded:bg-[color:var(--color-overlay-2)]")}
            >
              <span className="truncate text-label tabular-nums text-[color:var(--color-text-tertiary)]">
                {commit.relativeTime}
              </span>
              {/* The subject is the concept; a step without one falls back to the summary or raw subject. */}
              <span className="flex min-w-0 items-center gap-2.5 truncate text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
                {stepConcepts.length > 0 ? (
                  <>
                    {/* Truncated, never wrapped, so a long name cannot change the row's height
                        (`forbidden.md`); the full name stays recoverable. Its floor is the
                        row's `--git-row-h`; the declared `--git-step-h` is unused. */}
                    <StepConceptNames
                      concepts={stepConcepts}
                      more={(count) => t("moreSlugs", { count })}
                    />
                  </>
                ) : (
                  <span className="truncate" title={commit.subject}>{headline}</span>
                )}
              </span>
              {/* The why column, on the same line so time, name and reason each align down the list. */}
              <span
                className="truncate text-label text-[color:var(--color-text-tertiary)]"
                title={stepConcepts.length > 0 ? why : undefined}
              >
                {stepConcepts.length > 0
                  ? why
                  : names && trail
                    ? `${names} · ${trail}`
                    : /* Without concepts or a summary, the files the step touched are the reason. */
                      names || trail || stepFileNames(commit.files, (count) => t("moreSlugs", { count })) || " "}
              </span>
            </button>
          </li>
          </Fragment>
        );
      })}
      {/*
        The list ends with a fact: a row that fetches older steps in place, or the folder's first
        step.
      */}
      {hasMore ? (
        <li className="grid grid-cols-[var(--git-when-w)_minmax(0,1fr)] items-center gap-3 border-b border-[color:var(--color-divider)] px-4 py-1.5">
          <span aria-hidden />
          <button
            type="button"
            data-testid="atlas-git-history-more"
            {...rowProps()}
            disabled={moreBusy}
            onClick={onMore}
            className={controlClass({
              shape: "row",
              size: "sm",
              tone: "muted",
              hoverInk: "strong",
              hoverSurface: "lift",
              className: "justify-self-start -ml-2 text-[color:var(--color-text-tertiary)]",
            })}
          >
            {moreBusy ? t("historyMoreBusy") : t("historyMore")}
          </button>
        </li>
      ) : (
        <li
          data-testid="atlas-git-history-end"
          className="px-4 pt-3 pb-2 text-caption text-[color:var(--color-text-quaternary)]"
        >
          {t("historyEnd")}
        </li>
      )}
    </ul>
  );
}

/**
 * A one-line result for recording. Every ICU argument is passed, or next-intl renders the key
 * path; a missing `counts` field from Rust falls back to the list's counts.
 */
function SnapshotResultLine({
  t,
  result,
  fallbackCount,
  pushFailure,
}: {
  t: Translator;
  result: GitSnapshotResult;
  fallbackCount: number;
  /** Why the send failed, in the reader's language — git's reason, read by the caller. */
  pushFailure: string | null;
}) {
  const count = result.counts?.total ?? fallbackCount;
  const remote = result.push?.remoteUrl ?? "";
  const saved = result.committed ? t("snapshotDone", { count }) : t("snapshotNoChanges");
  /*
   * One sentence per outcome (`pushDone` already covers save and send). A failed send carries
   * git's reason, since `remoteUrl` is filled only on success.
   */
  const line = !result.push
    ? saved
    : result.push.pushed
      ? result.committed
        ? t("pushDone", { count, upstream: remote })
        : t("remoteDonePush")
      : `${saved} · ${pushFailure ?? t("pushFailed", { count, remote })}`;
  return (
    <p
      className="git-fade-in text-caption text-[color:var(--color-text-tertiary)]"
      data-testid="atlas-git-snapshot-result"
    >
      {line}
    </p>
  );
}

/** The dock's next-remote-step door (connect, or send once saved), one class since both share a slot. */
const DOCK_DOOR_CLASS = controlClass({
  shape: "chip",
  size: "sm",
  className:
    "border-[color:var(--color-border-soft)] hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]",
});

/**
 * The bottom dock with the screen's one decision, pinned (`mt-auto`) at the surface's heaviest
 * weight, with the recording-scope notice at the decision point. The confirm's mono line shows
 * the exact subject that will be recorded.
 */
function ActionDock({
  t,
  onConnectRemote,
  remoteState,
  branch,
  headShortHash,
  remoteBusy,
  onSendBranch,
  hasChanges,
  changeCount,
  predictedSubject,
  confirming,
  setConfirming,
  pushOptIn,
  setPushOptIn,
  snapshotting,
  snapshotResult,
  snapshotPushFailure,
  snapshotError,
  confirmSnapshot,
  upstream,
  snapshotMessage,
  setSnapshotMessage,
}: {
  t: Translator;
  /** The input the dock's last line opens when there is no remote. */
  onConnectRemote: () => void;
  /** Where this branch's steps can go; the dock's last line states the next step for it. */
  remoteState: GitRemoteState;
  branch: string | null;
  headShortHash: string | null;
  remoteBusy: null | "fetch" | "pull" | "push";
  /** The header's first send, offered again where the dock says there is one to make. */
  onSendBranch: () => void;
  hasChanges: boolean;
  changeCount: number;
  predictedSubject: string;
  confirming: boolean;
  setConfirming: (v: boolean) => void;
  pushOptIn: boolean;
  setPushOptIn: (v: boolean) => void;
  snapshotting: boolean;
  snapshotResult: GitSnapshotResult | null;
  /** Why the last save's send failed, in the reader's language; `null` when it did not fail. */
  snapshotPushFailure: string | null;
  snapshotError: string | null;
  confirmSnapshot: () => void;
  upstream: string | null;
  /** A subject the user typed. Empty falls back to the automatic wording. */
  snapshotMessage: string;
  setSnapshotMessage: (v: string) => void;
}) {
  const { triggerRef, initialRef, close, onKeyDown } = useInlineConfirmFocus(confirming, setConfirming, {
    busy: snapshotting,
  });
  /*
   * A finished commit's result takes focus, since the commit button it would return to is
   * inert once nothing is pending.
   */
  const resultRef = useRef<HTMLDivElement | null>(null);
  const confirmingBeforeRef = useRef(confirming);
  useEffect(() => {
    const closedByResult = confirmingBeforeRef.current && !confirming && snapshotResult !== null;
    confirmingBeforeRef.current = confirming;
    if (!closedByResult || typeof document === "undefined") return;
    const active = document.activeElement;
    if (!active || active === document.body) resultRef.current?.focus();
  }, [confirming, snapshotResult]);
  return (
    <div
      data-testid="atlas-git-dock"
      className="mt-auto flex shrink-0 flex-col gap-2 border-t border-[color:var(--color-divider)] pt-3"
    >
      {confirming ? (
        <div
          role="group"
          aria-label={t("messageLabel")}
          onKeyDown={onKeyDown}
          className="git-fade-in flex flex-col gap-2"
          data-testid="atlas-git-confirm-step"
        >
          <p className="text-caption text-[color:var(--color-text-tertiary)]">{t("confirmBody")}</p>
          {/* Editable so a step can say why; empty keeps the automatic subject the placeholder shows. */}
          <input
            type="text"
            ref={(node) => {
              initialRef.current = node;
            }}
            data-testid="atlas-git-message-input"
            value={snapshotMessage}
            onChange={(event) => setSnapshotMessage(event.target.value)}
            placeholder={predictedSubject}
            aria-label={t("messageLabel")}
            className={fieldClass({ multiline: true, size: "md", className: "w-full font-mono break-all" })}
          />
          {/* A saved origin can take the send too: its first send sets the upstream. */}
          <Checkbox
            data-testid="atlas-git-push-optin"
            checked={pushOptIn}
            disabled={!upstream && remoteState !== "never-sent"}
            onChange={(event) => setPushOptIn(event.target.checked)}
            label={t("pushOptIn")}
          />
          <p className="text-caption text-[color:var(--color-text-quaternary)]">
            {upstream
              ? t("pushOptInHint", { upstream })
              : remoteState === "never-sent"
                ? t("pushOptInFirstHint", { branch: branch ?? "" })
                : remoteState === "detached"
                  ? t("pushDetachedHint")
                  : remoteState === "no-remote"
                    ? t("pushNoUpstream")
                    : t("upstreamUnknown")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="atlas-git-confirm-button"
              disabled={snapshotting}
              onClick={confirmSnapshot}
              className={CONFIRM_PRIMARY_CLASS}
            >
              {snapshotting ? t("snapshotRunning") : t("confirmButton")}
            </button>
            <button
              type="button"
              data-testid="atlas-git-cancel-button"
              disabled={snapshotting}
              onClick={close}
              className={CONFIRM_CANCEL_CLASS}
            >
              {t("cancelButton")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          ref={triggerRef}
          data-testid="atlas-git-snapshot-button"
          disabled={!hasChanges}
          onClick={() => setConfirming(true)}
          className={cn(hasChanges ? CONFIRM_PRIMARY_CLASS : SNAPSHOT_INERT_CLASS, "self-start")}
        >
          {hasChanges ? null : <Check size={ICON_SIZE.sm} aria-hidden />}
          {hasChanges ? t("snapshotButton", { count: changeCount }) : t("noChanges")}
        </button>
      )}

      {snapshotError ? (
        <p
          className="git-fade-in text-caption text-[color:var(--color-text-secondary)]"
          data-testid="atlas-git-snapshot-error"
        >
          {snapshotError}
        </p>
      ) : null}
      {snapshotResult ? (
        <div
          ref={resultRef}
          tabIndex={-1}
          role="status"
          className="rounded-[var(--radius-chip)] outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)]"
        >
          <SnapshotResultLine
            t={t}
            result={snapshotResult}
            fallbackCount={changeCount}
            pushFailure={snapshotPushFailure}
          />
        </div>
      ) : null}

      {/*
        One next step per remote state; offering to connect where `origin` exists or HEAD is
        detached would rewrite the real remote.
      */}
      {upstream || remoteState === "unknown" ? (
        <p className="flex items-center gap-1.5 text-caption leading-label text-[color:var(--color-text-quaternary)]">
          <ShieldCheck size={ICON_SIZE.sm} aria-hidden className="shrink-0" />
          {t("scopeNotice")}
        </p>
      ) : remoteState === "no-remote" ? (
        <p
          data-testid="atlas-git-dock-no-remote"
          className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption leading-label text-[color:var(--color-text-quaternary)]"
        >
          <ShieldCheck size={ICON_SIZE.sm} aria-hidden className="shrink-0" />
          <span>{t("dockNoRemote")}</span>
          <button
            type="button"
            data-testid="atlas-git-dock-connect-remote"
            onClick={onConnectRemote}
            className={DOCK_DOOR_CLASS}
          >
            {t("dockConnectRemote")}
          </button>
        </p>
      ) : remoteState === "never-sent" ? (
        <p
          data-testid="atlas-git-dock-never-sent"
          className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption leading-label text-[color:var(--color-text-quaternary)]"
        >
          <ShieldCheck size={ICON_SIZE.sm} aria-hidden className="shrink-0" />
          <span>{t("dockNeverSent")}</span>
          <button
            type="button"
            data-testid="atlas-git-dock-send-branch"
            disabled={remoteBusy !== null}
            onClick={onSendBranch}
            className={DOCK_DOOR_CLASS}
          >
            {remoteBusy === "push" ? "…" : t("dockSendBranch")}
          </button>
        </p>
      ) : (
        // No button to wrap beside, so the sentence wraps under itself, not under the icon.
        <p
          data-testid="atlas-git-dock-detached"
          className="flex items-start gap-1.5 text-caption leading-label text-[color:var(--color-text-quaternary)]"
        >
          <ShieldCheck size={ICON_SIZE.sm} aria-hidden className="mt-0.5 shrink-0" />
          <span>{t("dockDetached", { commit: headShortHash ?? "HEAD" })}</span>
        </p>
      )}
    </div>
  );
}

function DesktopBody({
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
          <button
            type="button"
            data-testid="atlas-git-install-recheck"
            onClick={() => {
              onRecheckGit();
            }}
            className={cn(SECONDARY_ACTION_CLASS, "self-start")}
          >
            <RefreshCw size={ICON_SIZE.sm} aria-hidden />
            {t("install.recheck")}
          </button>
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
          <button
            type="button"
            data-testid="atlas-git-retry"
            onClick={onRetry}
            className={cn(SECONDARY_ACTION_CLASS, "self-start")}
          >
            <RefreshCw size={ICON_SIZE.sm} aria-hidden />
            {t("retryButton")}
          </button>
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
            <button
              type="button"
              data-testid="atlas-git-init"
              disabled={initRunning}
              onClick={onInit}
              className={PRIMARY_ACTION_CLASS}
            >
              {initRunning ? t("initRunning") : t("initButton")}
            </button>
            <button
              type="button"
              data-testid="atlas-git-init-copy"
              title={t("initTerminalHint")}
              onClick={onCopyInitCommand}
              className={SECONDARY_ACTION_CLASS}
            >
              {initCopyState === "copied"
                ? t("webCopied")
                : initCopyState === "failed"
                  ? t("webCopyFailed")
                  : t("initTerminalButton")}
            </button>
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

  // The evidence column is `minmax(0,1fr)` from `xl` and stacks under the list below it; the
  // declared `--git-evidence-min` (600px) is not applied.
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
