"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useCopyFeedback, type CopyFeedbackState } from "@/shared/lib/use-copy-feedback";
import { stepRowMotionClass, stepRowUsesStagger } from "../lib/step-row-motion";
import { useTranslations } from "next-intl";
// `History as HistoryIcon` — usability review P0 (2026-07-23): under certain
// HMR/bundle states the bare `History` identifier resolved to the global DOM
// History constructor, and `<History>` JSX dropped the whole screen into the
// error boundary with "Illegal constructor" (intermittent, stack captured). An
// alias can never collide with a global.
import {
  Check,
  ChevronRight,
  Download,
  FolderOpen,
  History as HistoryIcon,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { CONTROL_DISABLED_CLASS } from "@/shared/ui/control-class";
import { Link } from "@/i18n/navigation";
import {
  countChangesByStatus,
  formatSnapshotSummary,
  groupChangesByKind,
  type AtlasGitKindGroup,
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
  gitCommitDiff,
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
} from "@/shared/lib/tauri-git";
import type { OntologyChangeset } from "@/shared/lib/ontology-tree";
import { gitHostPlatformFrom, gitInstallGuide } from "@/shared/lib/git-install-guide";
import { TopologyV2KindGlyph } from "@/shared/ui/topology-v2-kind-glyph";
import { Checkbox, controlClass } from "@/shared/ui";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { buildConceptEgo, matchNodeId, type ConceptEgo } from "../model/build-concept-ego";
import { CommitDetail } from "./CommitDetail";
import { cn } from "@/shared/lib/cn";
import { fieldClass } from '@/shared/ui/control-class';

/**
 * Atlas Git — the body of the history destination.
 *
 * ## What this surface is for (2026-07-26 redesign)
 *
 * Owner: *"This page should make connecting git fast."*
 * (this page should make connecting git fast). So this is **not a dashboard that
 * reports state — it is a screen that makes the user able to do their job**. One
 * question decides its shape:
 *
 * > **Can this screen do its job (record) right now?**
 *
 * - **No → setup mode.** One task, so the screen says one thing: a single column
 *   (`--git-setup-measure`) centred in the frame, with one primary action as a
 *   real button. Progress is one line from the three-step connect flow
 *   (`ConnectLadder`).
 * - **Yes → workbench mode.** Left: what to record. Right: the evidence.
 *
 * The attention winner changing with state is **intended** — in setup the user's
 * job is "connect" and on the workbench it is "what do I record", and those two
 * moments cannot share a winner. (Toss public talks — one thing per screen;
 * Apple HIG — clarity and hierarchy.)
 *
 * ## Workbench redesign (2026-07-27) — this screen's job in one sentence
 *
 * Owner: *"This history page feels too much like AI output."* (this history page feels too much like
 * AI output). That was not a vibe but six measurable defects, and every one came
 * from never deciding what the screen is for. Decided, it reads:
 *
 * > **Check which of my concepts changed, and decide whether to record them as
 * > this step.**
 *
 * The hierarchy follows from that sentence. The attention winner is the pair
 * **changed-concept list + record** (the list is the subject, the button the
 * verb — one unit). Evidence (changed lines, past steps) is on-demand backing,
 * and location and remote are chrome-level state.
 *
 * So the workbench is **two shapes, not one**, split by whether there is
 * anything to decide (`data-shape`):
 *
 * - `decide` (unrecorded changes exist) — list plus bottom dock on the left,
 *   evidence on the right.
 * - `recall` (everything recorded) — the only job left is looking back, so it is
 *   a **single column** and past steps take the body. The old code declared two
 *   columns even here, leaving the right column holding one row with a
 *   **vertical divider running the full height** (measured 1512×950: 1 row of
 *   real ink on the right, 1,010px of empty height). The problem was that an
 *   empty column looks deliberate — the answer is not to make the column.
 *
 * The evidence column renders **only when it has something to show**
 * (`showEvidence`): a column's existence promises content, so it is not created
 * when the promise cannot be kept.
 *
 * The six "AI-feel" defects that were removed (each prescription sits on its own
 * component):
 * ① A rounded callout card with a left amber accent rail → one chrome line plus
 *    on-demand input (charter: that rail is a forbidden pattern, and amber is
 *    not excepted on this surface).
 * ② Two columns doing nothing → two shapes plus a conditional evidence column.
 * ③ A uniformly grey list reading as a build log → kind groups, status glyphs,
 *    concepts split from other files, selectable rows.
 * ④ The primary action being the weakest thing on screen → a filled indigo
 *    button in the bottom dock.
 * ⑤ Zero motion → one `.git-fade-in` (appear, stagger, swap) with a
 *    reduced-motion equivalent.
 * ⑥ Unfamiliar words and an inverted trust-copy hierarchy → "Recent History" became
 *    "Past Steps" (removing the clash with the page title "History"), and the
 *    recording-scope notice moved to **where the write happens**.
 *
 * The largest plumbing leak on this screen went with them: the evidence column
 * was dumping `diff --git`, `index 4a1c0de..8b71f92` and `@@ -12,6 +12,9 @@`
 * verbatim, and past steps rendered our own English commit subjects
 * (`ontology snapshot: +3 concepts, …`) raw on a Korean screen. Both are now
 * read back in human language by `atlas-git-record.ts`; the raw text survives in
 * the expanded detail as the audit trail.
 *
 * ## Why one line instead of a stepper widget
 *
 * A circle-and-connector stepper reads as a component added to fill empty space,
 * and above all it **lies**: registering a remote is optional, and piling steps
 * up on this machine alone is a legitimate end state. So the connect flow ends
 * at three steps — ① open in the app ② choose a folder ③ start recording (a
 * remote is not a step) — and lives as one line of 11px text with no chrome.
 *
 * ## Runtime split
 *
 * Desktop (Tauri): the 7 commands in `src-tauri/src/git.rs`, consumed through
 * the `tauri-git.ts` bridge — ① vault change summary (A/M/D per kind plus a
 * representative slug, the same formula as the CLI's `buildChangeSummary`)
 * ② record (explicit click → confirm step → `git_snapshot`; pushing is a
 * separate opt-in checkbox, off by default) ③ recent trail ④ changed lines of
 * not-yet-recorded work ⑤ start recording (`git_init`) ⑥ register a remote
 * (`git_set_remote`).
 *
 * Web (browser vault): a browser cannot spawn a process, so it degrades honestly
 * — a property of the surface, not a fixable defect. But it **does not stop at
 * "you can't"**: in a browser the only real next step on this surface is getting
 * the app, so `Get App` is the primary button and the terminal path (copy the
 * CLI) is a secondary escape below it. The previous screen had it exactly
 * backwards — the copy button was larger than the get-the-app link.
 *
 * Trust charter: **a write command only ever happens after a user click.** The
 * mount-time queries are read-only (status/diff/history), and
 * `git_init`/`git_set_remote`/`git_snapshot` are called only from their own
 * button's onClick. Tests pin that contract.
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
   * The vault graph — used to move a step's files onto **concepts**.
   *
   * Passed in from outside rather than read through a hook. `useOntologyInsight`
   * calls `useLocalVault` internally, so a widget calling it directly would make
   * every test that renders this component require a provider (measured: 33
   * broke at once). Injecting the data keeps the widget pure and leaves the
   * decision with the caller — `sessionChangeset` already set that precedent.
   */
  graph?: { nodes: readonly KnowledgeGraphNode[]; edges: readonly KnowledgeGraphEdge[] } | null;
  className?: string;
}

/** S1's secondary escape, for users who prefer the terminal. Git vocabulary is exposed only here. */
const INIT_CLI_COMMAND = "git init";

/**
 * The primary action — the **one** thing this screen asks of the user. Setup's
 * "Get App / Choose Folder / Start Recording" and the workbench's "Leave N items" all use the
 * same weight: actions of equal standing must look equal.
 *
 * Height is `--git-setup-action-height` (36px on desktop, the same step as the
 * chrome tiles under the locked-scale contract, promoted to 44px on a coarse
 * pointer). The ramp step is `text-body` (12.5px) — the old 11px link/button did
 * not read as a page's primary action (owner measurement: in the web degradation
 * the only real next step was smaller than the copy button).
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
 * The primary action's slot when there is nothing to record — **disabled, not
 * gone**.
 *
 * If the verb's home disappears with state, the user relearns where to look
 * every time (Apple HIG — controls keep stable positions). But a filled indigo
 * at 60% opacity reads as a broken primary button, so in this state it becomes a
 * quiet shape that says "done". The screen's attention winner moves to past
 * steps then.
 */
const DOCK_INERT_CLASS =
  "inline-flex h-[var(--git-setup-action-height)] shrink-0 items-center justify-center gap-1.5 rounded-[var(--chrome-radius-inner)] border border-[color:var(--color-border-soft)] px-3.5 text-body text-[color:var(--color-text-quaternary)]";

const noopSubscribe = () => () => {};

/**
 * Section label.
 *
 * 2026-07-26 — the mono + `uppercase` + 0.12em-tracking eyebrow grammar was
 * removed. That combination is a **Latin-only device**: JetBrains Mono has no
 * Hangul glyphs, so "Things changed this time" fell back wholesale to the system font, and
 * 0.12em tracking on top of it reads in Hangul not as letter-spacing but as
 * **broken word spacing** (at 1920 it looked like "Things  changed  this  time").
 * `uppercase` does nothing at all to Hangul, so only its side effects remain.
 *
 * Hierarchy comes instead from the body stack (Pretendard) plus the
 * `--text-label` ramp step and quaternary ink — a label is demoted with colour
 * and size, not with tracking.
 */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-label font-[var(--font-weight-signature)] text-[color:var(--color-text-quaternary)]">
      {children}
    </span>
  );
}

/**
 * The stage, split by whether the screen can do its job.
 *
 * Only `workbench` means "yes"; everything else is setup. `loading` and `error`
 * use the setup frame too, because in those moments the only thing the user can
 * do is wait or re-check, and full-width top alignment would read as "a page
 * whose content failed to appear".
 */
/**
 * What the workbench is currently showing. `pending` = changes not yet
 * committed, `commit` = the commit at that hash.
 */
export type WorkbenchSelection = { kind: "pending" } | { kind: "commit"; hash: string };

type GitStage = "web" | "no-vault" | "loading" | "not-installed" | "error" | "not-initialized" | "workbench";

type SetupStep = 1 | 2 | 3;

export function AtlasGitPanel({
  vaultPath = null,
  sessionChangeset = null,
  graph = null,
  className,
}: AtlasGitPanelProps) {
  const t = useTranslations("atlasGit");
  /*
   * Kind names have one source of truth: the `kinds` namespace. A key minted
   * here would write the same fact in two places, and drift starts there.
   */
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

  const [status, setStatus] = useState<GitStatusResult | null>(null);
  const [changes, setChanges] = useState<GitChangeEntry[]>([]);
  const [diffText, setDiffText] = useState("");
  const [history, setHistory] = useState<GitCommitInfo[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  /*
   * Whether git is installed — `null` means **not known yet**; absence is never
   * assumed before checking. This is read-only detection, so calling it
   * automatically does not conflict with the charter's ban on automatic
   * execution: `git_probe` installs nothing and only tests for an executable.
   */
  /*
   * The concepts each step changed. This used to **guess by parsing the commit
   * subject** (`describeSnapshotSubject`), which only ever fit subjects our own
   * tool wrote and never fit human commits. #842 ships per-commit files with
   * kind/slug, so nothing is guessed any more — only what actually matches a
   * concept node in the vault is counted.
   */
  const conceptsByHash = useMemo(() => {
    const nodes = graph?.nodes ?? [];
    const map = new Map<string, { id: string; label: string; kind: string }[]>();
    for (const commit of history) {
      const seen = new Set<string>();
      const list: { id: string; label: string; kind: string }[] = [];
      for (const file of commit.files ?? []) {
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

  const [gitInstalled, setGitInstalled] = useState<boolean | null>(null);
  const probeGit = useCallback(async () => {
    try {
      const probe = await gitProbe();
      // No bridge (`null`) means the web path, which is not this state's call to make.
      setGitInstalled(probe === null ? null : probe.installed);
    } catch {
      /*
       * A failed probe **does not mean absent.** Left as `null` (unknown), the
       * screen draws the normal path rather than install guidance — telling a
       * user their git is missing is worse than admitting you do not know.
       * Uncaught, this would become an unhandled rejection.
       */
      setGitInstalled(null);
    }
  }, []);
  /*
   * Called **only after a folder is chosen** (2026-08-02, caught by a contract
   * test: "If there is no folder inside the app … no IPC at all" — inside the app with
   * no folder, no IPC at all).
   *
   * Two reasons. ① With no folder this screen has nothing to do whether or not
   * git exists, so there is no point asking a question whose answer goes unused.
   * ② macOS pops the **system install dialog** when git is invoked without the
   * command line tools — an OS window the user never asked for, on a screen they
   * have not even opened.
   */
  useEffect(() => {
    if (!vaultPath) return;
    void probeGit();
  }, [probeGit, vaultPath]);
  const [loadErrorText, setLoadErrorText] = useState<string | null>(null);

  const [confirming, setConfirming] = useState(false);
  const [pushOptIn, setPushOptIn] = useState(false);
  const [snapshotting, setSnapshotting] = useState(false);
  const [snapshotResult, setSnapshotResult] = useState<GitSnapshotResult | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);

  /**
   * Evidence pane tabs — changed lines / past steps. List left, evidence right
   * (#85).
   *
   * `null` = **the user has not chosen yet**, and the tab then follows state: if
   * there are changed lines to show, "Changed Lines", otherwise "Past Steps". The test
   * is the number of **parsed diff files**, not the number of changes: when only
   * newly created documents changed there is nothing prior to compare against,
   * so deciding on change count lands the user in an empty pane they never asked
   * for (the line in the owner's screenshot).
   */
  /*
   * The workbench selection — **an axis that replaces tabs**.
   *
   * The right column used to split into "Changed Content / Commit History" tabs, but those
   * two are really *"not yet committed vs committed"*, which **the list's
   * position already states** (uncommitted at the top, committed below, in time
   * order). With tabs, commit history hid behind one — and the owner genuinely
   * never saw the new screen.
   *
   * `null` = not chosen yet → `selection` below decides from state.
   */
  const [selectionChoice, setSelectionChoice] = useState<WorkbenchSelection | null>(null);

  /**
   * Path of the document chosen in the list. `null` = nothing chosen, so the
   * evidence column shows **all** changed concepts. The old screen left the right
   * side holding one line — "choose a document on the left…" — which is an empty
   * pane nobody asked for. The default before choosing has to be "everything"
   * (Shneiderman: overview first).
   */
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  /** The remote input — opened only from the location line's button; it never sits there as a card. */
  const [remoteOpen, setRemoteOpen] = useState(false);
  /** Non-concept files, collapsed by default. Recorded along with the rest, but not what the user judges. */
  const [othersOpen, setOthersOpen] = useState(false);

  // State for S1 (start recording) and S4 (register a remote).
  const [initRunning, setInitRunning] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [remoteRunning, setRemoteRunning] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [remoteNotice, setRemoteNotice] = useState<string | null>(null);

  // Read-only queries (status/diff/history) only — a write (git_snapshot) never happens here.
  const refresh = useCallback(async () => {
    if (!vaultPath) return;
    // No synchronous setState before the first await (react-hooks/
    // set-state-in-effect — an effect calls this directly). The initial
    // loadState is already "loading".
    try {
      const nextStatus = await gitStatus(vaultPath);
      if (!nextStatus) return;
      setLoadErrorText(null);
      setStatus(nextStatus);
      if (nextStatus.initialized) {
        const [diffResult, historyResult] = await Promise.all([
          gitDiff(vaultPath),
          gitHistory(vaultPath, 10),
        ]);
        setChanges(diffResult?.files ?? []);
        setDiffText(diffResult?.diff ?? "");
        setHistory(historyResult ?? []);
      } else {
        setChanges([]);
        setDiffText("");
        setHistory([]);
      }
      setLoadState("ready");
    } catch (err) {
      setLoadErrorText(gitErrorMessage(err));
      setLoadState("error");
    }
  }, [vaultPath]);

  useEffect(() => {
    if (desktop) void refresh();
  }, [desktop, refresh]);

  // Split what the user judges (concepts) from the files that ride along. What
  // they have to read here is "which of my concepts changed"; `.gitignore` and
  // `package.json` are recorded too but are not for reading. The commit formula
  // still covers **everything**.
  const { concepts, others } = useMemo(() => splitConceptChanges(changes), [changes]);
  const kindGroups = useMemo(() => groupChangesByKind(concepts), [concepts]);
  const statusCounts = useMemo(() => countChangesByStatus(changes), [changes]);
  const predictedSubject = useMemo(() => formatSnapshotSummary(changes), [changes]);
  const hasChanges = changes.length > 0;

  // Per-file diffs with the git plumbing stripped. Computed here because the
  // default-tab decision and the per-row line counts both need this value, and
  // computing it twice in children would let two places on screen state
  // different facts.
  const diffFiles = useMemo(() => parseUnifiedDiff(diffText), [diffText]);
  /*
   * Default before choosing: uncommitted changes if there are any, otherwise the
   * most recent commit. The test is the number of **parsed diff files**, not the
   * number of changes, for the same reason as the old tab decision — when only
   * newly created documents changed there is nothing to compare against, and
   * deciding on change count lands the user in an empty pane they never asked for.
   */
  const selection: WorkbenchSelection =
    selectionChoice ??
    (diffFiles.length > 0
      ? { kind: "pending" }
      : history.length > 0
        ? { kind: "commit", hash: history[0].hash }
        : { kind: "pending" });

  /*
   * The chosen step's patch, read **only when the selection changes**. Reading
   * them all up front while drawing the list would be one `git show` per step —
   * paying in advance for what is not on screen (`architecture.md`
      「Do not build a model of a surface that is not drawn」 — do not build the model of a surface
   * that is not drawn). `null` means "not known yet"; `""` means "none".
   */
  const [commitDiff, setCommitDiff] = useState<string | null>(null);
  const diffHash = selection.kind === "commit" ? selection.hash : null;
  useEffect(() => {
    if (!vaultPath || !diffHash) {
      setCommitDiff(null);
      return;
    }
    let cancelled = false;
    setCommitDiff(null);
    void gitCommitDiff(vaultPath, diffHash)
      .then((result) => {
        if (!cancelled) setCommitDiff(result?.diff ?? "");
      })
      // A failed read does not bring the screen down — that section just says "none".
      .catch(() => {
        if (!cancelled) setCommitDiff("");
      });
    return () => {
      cancelled = true;
    };
  }, [vaultPath, diffHash]);

  const stage: GitStage = !bridgeAvailable
    ? "web"
    : !vaultPath
      ? "no-vault"
      /*
       * git being absent entirely is **separated from an error** (2026-08-02).
       *
       * It used to fall into `loadState === "error"`, showing only a raw spawn
       * failure string. Yet **the install guidance already exists in this
       * repository** — `git_probe` (Rust), `gitProbe()` (bridge),
       * `gitInstallGuide()` (per-platform command plus download link, tests
       * included) and 13 strings (`atlasGit.install.*`). The screen simply never
       * called them: **every door was built and none was cut open**.
       *
       * Applying `surfaces.md`'s degradation-card contract (why it does not work ·
       * where it does · what works here) needed **not one new sentence**.
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
   * A commit subject the user wrote. **An empty string means the automatic
   * subject** — Rust's `git_snapshot(message: Option<String>)` already splits on
   * exactly that.
   *
   * Only the automatic subject was possible before. It says what changed well,
   * but never **why**, and why is what someone reading the history later actually
   * looks for (owner: *"you should be able to commit manually too"* — you should be able to
   * commit manually too).
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
        ...(trimmed ? { message: trimmed } : {}),
      });
      setSnapshotResult(result);
      setConfirming(false);
      setPushOptIn(false);
      setSnapshotMessage("");
      /*
       * Clear the user's explicit selection so the screen returns to its default
       * right after a commit: remaining changes keep the uncommitted row
       * selected, otherwise the commit just created opens. Showing the result of
       * what you just did is the right answer.
       */
      setSelectionChoice(null);
      setSelectedPath(null);
      await refresh();
    } catch (err) {
      setSnapshotError(gitErrorMessage(err));
    } finally {
      setSnapshotting(false);
    }
  }, [vaultPath, pushOptIn, snapshotMessage, refresh]);

  /**
   * A copy reports **both success and failure** (2026-07-28 QA).
   *
   * The old shape was `if (await copyText(...)) { show success }`. Clipboard
   * permission **can be denied silently**, and the screen then says nothing — the
   * user believes it copied and finds out at paste time. Silence reads as success.
   *
   * The shared `useCopyFeedback` already has the three states
   * `idle | copied | failed`; use it rather than inventing a mechanism.
   */
  const { state: initCopyState, copy: copyInitCommandText } = useCopyFeedback(1600);
  const copyInitCommand = useCallback(
    () => void copyInitCommandText(INIT_CLI_COMMAND),
    [copyInitCommandText],
  );

  /**
   * Start recording — **this function is called only from a button's onClick.**
   * Never call it from mount, focus or refresh paths (trust charter: zero
   * automatic execution). init does not chain into a commit, so the state after
   * success is "N changes not yet recorded".
   */
  const startTracking = useCallback(async () => {
    if (!vaultPath) return;
    setInitRunning(true);
    setInitError(null);
    try {
      await gitInit(vaultPath);
      await refresh();
    } catch (err) {
      setInitError(gitErrorMessage(err));
    } finally {
      setInitRunning(false);
    }
  }, [vaultPath, refresh]);

  /*
   * The three remote actions — Fetch, Pull, Push.
   *
   * Pull was **entirely absent** from this screen (present in both the bridge and
   * Rust, with no caller), and Push lived only inside a checkbox on the record
   * confirm step. So with zero changes to record there was no way on screen to
   * send steps already piled up, even while ahead of the remote (owner
   * measurement: ↑2 with nowhere to send).
   *
   * All three run **only after an explicit click**. Zero automatic calls, exactly
   * as the trust charter requires.
   */
  const [remoteBusy, setRemoteBusy] = useState<null | "fetch" | "pull" | "push">(null);
  const [remoteActionNotice, setRemoteActionNotice] = useState<string | null>(null);
  const [remoteActionError, setRemoteActionError] = useState<string | null>(null);
  const runRemote = useCallback(
    async (kind: "fetch" | "pull" | "push") => {
      if (!vaultPath) return;
      setRemoteBusy(kind);
      setRemoteActionError(null);
      setRemoteActionNotice(null);
      try {
        if (kind === "fetch") {
          const r = await gitFetch(vaultPath);
          if (r) setRemoteActionNotice(t("remoteDoneFetch", { summary: r.summary }));
        } else if (kind === "pull") {
          const r = await gitPull(vaultPath);
          if (r) setRemoteActionNotice(t("remoteDonePull", { summary: r.summary }));
        } else {
          /*
           * Push has no dedicated command — `git_snapshot(push:true)` does that
           * job. With zero changes to record it returns
           * `committed:false/no-changes` and **only the already-piled steps are
           * sent**, which is what makes "you can push with nothing to commit"
           * true.
           */
          const r = await gitSnapshot(vaultPath, { push: true });
          if (r?.push?.pushed) setRemoteActionNotice(t("remoteDonePush"));
          else if (r?.push?.guidance) setRemoteActionError(r.push.guidance);
          else if (r?.push?.message) setRemoteActionError(r.push.message);
        }
        await refresh();
      } catch (err) {
        setRemoteActionError(gitErrorMessage(err));
      } finally {
        setRemoteBusy(null);
      }
    },
    [vaultPath, refresh, t],
  );

  /**
   * Register a remote — it stores the address and **does not send**. Sending is a
   * separate press on the snapshot screen; "it only goes out when you press" is
   * kept at the call boundary.
   */
  const submitRemote = useCallback(async () => {
    if (!vaultPath) return;
    setRemoteRunning(true);
    setRemoteError(null);
    setRemoteNotice(null);
    try {
      const result = await gitSetRemote(vaultPath, remoteUrl);
      if (result) {
        setRemoteNotice(
          result.replaced
            ? t("remoteReplaced", { previous: result.replaced })
            : t("remoteSaved"),
        );
        setRemoteUrl("");
      }
      await refresh();
    } catch (err) {
      setRemoteError(gitErrorMessage(err));
    } finally {
      setRemoteRunning(false);
    }
  }, [vaultPath, remoteUrl, refresh, t]);

  return (
    <section
      aria-label={t("title")}
      data-testid="atlas-git-panel"
      data-stage={stage}
      // The sheet's skeleton belongs to the host (HomePage's scrim + card shell).
      // Adding a border or background here produces a double card (owner report
      // 2026-07-23: "it does not look good" — it does not look good). Same division of
      // labour as AgentConnectSheet: the panel carries content only.
      className={cn("flex w-full min-h-0 flex-col", className)}
    >
      {/* Scroll frame.
          - Setup: the single column stands centred via `m-auto` (auto margin
            rather than `justify-center`, so it collapses to 0 when the content
            grows and the top is never clipped).
          - Workbench (lg+): **each column owns its scroll**. If the frame
            scrolled, the bottom dock — the primary action — would be pushed off
            screen and the one thing this page asks for would hide behind a
            scroll. Below `lg` the two columns stack, so page scroll is right and
            the dock sits above the tab bar reserve.
          - The header draws **inside its own width** on the workbench: a
            full-width divider above a 920px column makes the line's promised
            width disagree with the content's. */}
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-y-auto px-5",
          stage === "workbench"
            ? // Below `lg` the two columns stack and the page scrolls, so the
              // last surface reserves space rather than sliding under the bottom
              // tab bar (design.md touch contract).
              "py-5 max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+12px)] xl:overflow-hidden"
            : "py-6",
        )}
      >
        {stage === "workbench" ||
        stage === "not-initialized" ||
        stage === "loading" ||
        stage === "error" ? (
          <DesktopBody
            commitDiff={commitDiff}
            snapshotMessage={snapshotMessage}
            setSnapshotMessage={setSnapshotMessage}
            hostPlatformHint={
              typeof navigator === "undefined"
                ? ""
                : navigator.platform || navigator.userAgent
            }
            onRecheckGit={() => {
              void probeGit();
              refresh();
            }}
            key={stage}
            t={t}
            stage={stage}
            loadErrorText={loadErrorText}
            status={status}
            kindGroups={kindGroups}
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
            snapshotError={snapshotError}
            confirmSnapshot={confirmSnapshot}
            onRetry={refresh}
            selection={selection}
            setSelection={setSelectionChoice}
            diffFiles={diffFiles}
            history={history}
            selectedPath={selectedPath}
            setSelectedPath={setSelectedPath}
            othersOpen={othersOpen}
            setOthersOpen={setOthersOpen}
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
 * The destination headline (follow-up to the 2026-07-25 promotion to a
 * destination). When the modal was deleted this panel's only consumer became the
 * `/git/` destination, but the header was still modal grammar — an 11px indigo
 * mono eyebrow plus a close X. That is too small for a page title, and a
 * destination has no concept of "close" (leaving is going elsewhere on the rail).
 * It moved up to a **destination headline** (`--text-display`), not one ramp step.
 *
 * `inColumn` = placed inside a column (setup's measure, the workbench's shape).
 * It drops the full-width divider and leaves horizontal padding to the column, so
 * the line's width and the content's width agree.
 *
 * `trailing` = state at the header's right (the workbench's location line).
 * Identity left, state right, one row — promoting state to a card above the
 * content would make it the first impression.
 *
 * `showScope` = whether the recording-scope notice is said here. On the workbench
 * it moves to **where the write happens** (the bottom dock): trust copy is a
 * promise made at the decision point, not page decoration, and here it was an
 * unnoticed grey caption.
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
        {/* Use the ramp utility even when raising the headline step at wide
            widths. Referencing a ramp token through an arbitrary length raises
            only the font size while the line-height of the step below stays, so a
            ratio nobody chose gets created — which is what happened here (23px
            text on title's 24px leading, 1.04). */}
        <h1 className="flex items-center gap-2 text-title font-[var(--font-weight-strong)] tracking-[var(--tracking-title)] text-[color:var(--color-text-primary)] sm:text-display">
          <HistoryIcon size={ICON_SIZE.lg} aria-hidden className="text-[color:var(--color-indigo-text-soft)]" />
          {t("title")}
        </h1>
        {/* The old `subtitle` ("records vault changes as a git snapshot") was
            deleted: 12 characters carrying three system terms (vault, git,
            snapshot). The scope notice takes its place — the second thing a user
            needs confirmed is not a product description but "nothing outside my
            folder is touched". */}
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
 * The connect flow — "where am I and what is left".
 *
 * A circle-and-connector **stepper widget** is still rejected: it inflates the
 * step count. Registering a remote is **optional**, so it is not in the flow;
 * piling steps up on this machine alone is a legitimate end state, and drawing
 * that as "incomplete" is a lie. So there are still three steps.
 *
 * 2026-08-02 — **from one line to three rows.** The old form was a single 11px
 * line, and measured, it was the **smallest element** on a screen 16px tall that
 * held all three steps — while being exactly what the user most wants to know
 * here (where am I). Tufte's "ink to the data" is not an instruction to save ink
 * but to **spend it on data**. Each step now carries two rows, name
 * (`text-body`) and description (`text-label`), with a left hairline rail
 * carrying progress.
 *
 * Colour is still one indigo: done = indigo-outlined check, current = filled
 * indigo mark plus rail highlight plus primary label, later = neutral border plus
 * tertiary label.
 *
 * Dimension regularity: all three rows use two lines (no step lacks a
 * description), so row height never shifts with content.
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
            {/* Progress rail — only the current step paints indigo over the
                parent hairline. It is a **segment of a line that already
                exists**, not a connector shape, so it is not new ink. */}
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
 * Preview — **what this screen becomes once connected**.
 *
 * Why this is not decoration: in this state the screen asks the user for one
 * thing ("get the app" / "choose a folder"). **Without saying what they get, that
 * is an order rather than an offer.** A first-time visitor cannot imagine the
 * destination from the word "records" alone. So the destination's skeleton —
 * timeline on the left, the chosen step's concepts and neighbours on the right —
 * is shown in miniature. It is the thing this screen is selling.
 *
 * **No data is invented.** There is no vault at this moment, so writing fake
 * concept names here would make the screen lie. Name positions are **redaction
 * bars**; only the positions carrying identity (the chips) use real product
 * vocabulary (the `kinds` namespace) and the real glyph (`TopologyV2KindGlyph`,
 * the single facade). The shapes follow the kind→silhouette contract, so no
 * third source of shapes appears.
 *
 * Weight: `opacity-45` plus `aria-hidden` — it is not yours yet, and assistive
 * technology and the keyboard do not land here. No second channel such as
 * `filter: saturate()` (neutrals plus one indigo).
 */
const PREVIEW_ROW_KINDS = [
  "capability",
  "domain",
  "element",
  "capability",
  "element",
  "capability",
] as const;
/**
 * Satellite coordinates (%) for the neighbour sketch — **four bearings**, not an
 * arbitrary constellation. `EGO_BEARINGS` (belongs to · contains · depends on ·
 * used by) and the studio's fixed bearings (UP/DOWN/RIGHT/LEFT) already use this
 * grammar, so the drawing states the destination's real layout. Four diagonals
 * read as a large X and meant nothing (measured on the first mockup).
 */
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
        {/* Location line */}
        <div className="flex items-center gap-2 border-b border-[color:var(--color-divider)] px-3 py-2">
          <span className="h-1.5 w-24 rounded-full bg-[color:var(--color-overlay-3)]" />
          <span className="ml-auto h-4 w-10 rounded-[var(--radius-chip)] border border-[color:var(--color-border-soft)]" />
        </div>
        {/* Between `lg` and `xl` only the timeline survives — forcing two cells
            into a narrow width gives a mangled diagram, not a smaller one. */}
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          {/* Timeline */}
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
                <TopologyV2KindGlyph kind={kind} size={11} />
                <span
                  className="h-1.5 rounded-full bg-[color:var(--color-overlay-3)]"
                  style={{ width: `${String(46 + index * 9)}%` }}
                />
              </span>
            ))}
          </div>
          {/* The chosen step's detail */}
          <div className="hidden min-w-0 flex-col gap-2.5 p-3 xl:flex">
            <span className="h-1.5 w-2/3 rounded-full bg-[color:var(--color-overlay-3)]" />
            {/* This sketch's grammar is **grey bars instead of text** — all
                twenty-odd other positions are. These two chips were the only ones
                holding real words (`capability`, `element`), and under `opacity-45` they
                measured **2.09:1**. Ink cannot fix it: at this opacity even the
                ramp's brightest ink (`--color-text-primary`) is 4.30, short of AA
                (pure white is exactly 4.50). The fixable axis is not colour but
                **the presence of text**, and bars make the sketch match its own
                grammar. The glyph already states the kind, and the caption below
                states what the drawing is.
                `text-caption` stays — its leading is what sets the chip height. */}
            <div className="flex flex-wrap gap-1.5">
              {(["capability", "element"] as const).map((kind) => (
                <span
                  key={kind}
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius-chip)] border border-[color:var(--color-border-soft)] px-1.5 py-0.5 text-caption"
                >
                  <TopologyV2KindGlyph kind={kind} size={9} />
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
                    stroke="var(--topology-v2-edge-contains)"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>
              <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color:var(--color-canvas)] p-1">
                <TopologyV2KindGlyph kind="capability" size={17} />
              </span>
              {PREVIEW_SATELLITES.map((s) => (
                <span
                  key={`g-${String(s.x)}-${String(s.y)}`}
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color:var(--color-canvas)] p-1"
                  style={{ left: `${String(s.x)}%`, top: `${String(s.y)}%` }}
                >
                  <TopologyV2KindGlyph kind={s.kind} size={11} />
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
 * The setup stage — every "cannot do its job yet" state uses the **same body**.
 *
 * ## 2026-08-02 redesign — from one column to a two-cell stage
 *
 * Owner: *"why is it stuck to the top, the content is small and the composition is poor"* (why is it stuck to
 * the top, the content is small and the composition is poor) →
 * *"don't revert it — redesign it"* (don't revert it — redesign it).
 *
 * The measurements explain that verdict exactly (1512×806, `/ko/git/`): a 520px
 * column used 520×464 = **19.8%** of the screen, leaving 348px on each side
 * (**57.2%** of the panel width) and 298px below carrying nothing. Inside it the
 * largest visual mass was **not the primary action** but the terminal escape —
 * the get-the-app button at 86×36 = 3,096px² against the CLI command box at
 * 520×46 = 23,920px². The secondary was **7.7×** the primary (a Tufte data-ink
 * inversion). Top versus centre alignment was a **consequence** of that defect,
 * not its cause, so neither reverting nor keeping it was the answer.
 *
 * So the stage has two cells:
 *
 * - **Left (the telling cell, `--git-setup-measure` 520px)** — what to do now.
 *   The title rises from `text-title` (16px) to `text-display` (23px) and "records"
 *   drops to a one-line eyebrow: this screen's title is not "records" but **"choose
 *   a folder first"** (Toss public talks — one thing per screen). Body text goes
 *   one step from `text-body` (12.5) to `text-body-lg` (14) — the substance of
 *   "the content is small".
 * - **Right (the showing cell, `1fr`)** — what the screen becomes once connected
 *   (`SetupPreview`). This is where an order turns into a promise.
 *
 * Vertically it is centred. Now that the stage uses the full width, centring
 * reads as "this screen's content" rather than "a floating dialog". Below `xl`
 * the preview drops and only the telling cell remains (a shrunken diagram in a
 * narrow width is not a diagram).
 *
 * Appearance motion reuses the existing `.topology-chrome-in` —
 * `--topology-motion-panel-duration` (180ms) plus `--topology-motion-ease-out`.
 * Zero new durations or easings. `prefers-reduced-motion` degrades through the
 * globals base layer's equivalent, which removes only the moving axis.
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
  /**
   * The promise on the last line. It defaults to the recording-scope notice: a
   * first-time user's biggest worry is "does it touch anything outside my
   * folder", and that answer belongs **immediately before** the action.
   */
  note?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      data-testid="atlas-git-setup"
      data-setup-state={state}
      className="topology-chrome-in grid w-full flex-1 grid-cols-1 content-center items-center gap-9 py-[var(--git-setup-top)] lg:grid-cols-[minmax(0,var(--git-setup-measure))_minmax(0,var(--git-setup-preview-max))] lg:justify-center lg:gap-10 xl:gap-14"
    >
      {/* The telling cell never exceeds the prose measure **at any width**.
          Without that cap, below `lg` where the two cells fold, the divider and
          the CLI line stretch to 1,012px and `justify-between` pushes the ends
          700px apart — the settings sheet had the same illness once (see the
          `--settings-content-measure` comment). */}
      <div className="flex min-w-0 max-w-[var(--git-setup-measure)] flex-col gap-5">
        {/* "records" is not this screen's title but **where you are** — the
            destination name drops to an eyebrow and the h1 belongs to the task at
            hand. */}
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
 * S0 — the browser. A browser cannot run git, and that fact stays as it is. What
 * changed is the **order of weight**: on the previous screen this surface's only
 * real next step (`get the app`) was an 11px text link, smaller than the copy button
 * above it. Now get-the-app is the primary button and the terminal path is a
 * secondary escape below it.
 */

/**
 * What changed this session — known **independently of git**.
 *
 * `change-baseline-store` holds a per-vault baseline and
 * `computeOntologyChangeset` counts additions, edits and deletions against it. It
 * survives a reload.
 *
 * This summary used to be drawn **only in the web degradation**, so a desktop
 * user who had not turned git on was offered "start recording" and shown not one
 * character of *what actually changed* — a worse state than the web (owner,
 * 2026-08-02). Withholding what you already know is an omission, not a
 * degradation.
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
       * ⚠️ **The terminal escape was removed** (2026-08-09, owner: *"is this even needed? it doesn't
       * look necessary"* — is this even needed? it doesn't look necessary).
       *
       * What stood here was one `node $ATLAS/cli/src/index.mjs snapshot` line plus
       * a copy button plus the footnote "first, run `export ATLAS=…` once". Two
       * reasons it went:
       *
       * ① **Almost nobody could use it.** `$ATLAS` has to point at this
       *    repository's **source folder** — that is, clone-only. The footnote
       *    admitted as much itself: *"there is no npm package."* A product screen had
       *    become the place where we explain that our package does not exist.
       * ② **It was not needed either.** If the vault is a git repository, plain
       *    `git commit` does the job. There is no reason to go through our CLI
       *    wrapper, so this was not an escape hatch but **promotion of our own
       *    tool**.
       *
       * The degradation-card contract (`surfaces.md`: why · where it works · what
       * works here) still holds — "why" is carried by the frame body, "where" by
       * the `/download` above, and "what works here" by the session summary below.
       * The terminal is not *this* screen.
       */}
    </SetupFrame>
  );
}

/**
 * S1 — the app is open but there is no folder.
 *
 * This state used to fall through to the web degradation screen, meaning that
 * inside the desktop app it showed "the browser has no permission to run git /
 * get the app" — **false guidance** telling someone already using the app to get
 * the app. This step's real next action is choosing a folder, and that lives in
 * the docs vault.
 */
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
 * The location line — **where this folder's steps pile up**. Header right, one row.
 *
 * This spot was defect ① of the old screen: the same fact ("right now they only
 * pile up on this computer") was lifted above the content as a **rounded card
 * with a full-height left amber rail, a title, body text, an input and help
 * text**, so a user who came to look at history got a settings pitch as their
 * first impression. That form is also a pattern `design.md` forbids by name (a
 * full-height coloured rail inside a card = AI SaaS callout), and amber is a
 * defect outside the hub node / Layer 0 container and the two written exceptions
 * — this card was not one of them.
 *
 * So **the fact stayed and the form went**: the fact is one chrome line (11px
 * quaternary), the action a quiet button beside it. The input arrives only when
 * pressed.
 */
/** One remote action — the label keeps the original term, and the tooltip carries what it does. */
function RemoteActionButton({
  id,
  label,
  hint,
  busy,
  disabled,
  onClick,
}: {
  id: "fetch" | "pull" | "push";
  label: string;
  hint: string;
  busy: boolean;
  disabled: boolean;
  onClick: (kind: "fetch" | "pull" | "push") => void;
}) {
  return (
    <button
      type="button"
      data-testid={`atlas-git-remote-${id}`}
      title={hint}
      disabled={disabled}
      onClick={() => onClick(id)}
      /*
       * **It has to look pressable** (owner, 2026-08-02: *"it is so small I cannot even tell it is a button"* — it is so small I cannot even tell it is a button).
       *
       * It used to be 24px tall, transparent, with quaternary-grade ink. 24px is
       * WCAG 2.2 §2.5.8's **minimum**, not a primary action's dimension, and with
       * no background only a border remains, which is indistinguishable from a
       * chip (something you read) — while these three are the hardest actions on
       * the screen to undo, since they reach a remote.
       *
       * So all three changed: 28px tall, `elevated` background, secondary ink.
       * Zero new values (all ramp and token).
       */
      className={controlClass({
        shape: "chip",
        size: "md",
        tone: "secondary",
        className:
          "font-[var(--font-weight-signature)] border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)] hover:border-[color:var(--color-indigo-a46)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] disabled:border-[color:var(--color-border-soft)] disabled:bg-transparent disabled:text-[color:var(--color-text-quaternary)]",
      })}
    >
      {busy ? "…" : label}
    </button>
  );
}

function LocationLine({
  t,
  branch,
  upstream,
  ahead,
  behind,
  remoteOpen,
  setRemoteOpen,
  remoteBusy,
  onRemoteAction,
}: {
  t: Translator;
  branch: string | null;
  upstream: string | null;
  /** With no upstream both are null — that is "unknown", not 0. */
  ahead: number | null;
  behind: number | null;
  remoteOpen: boolean;
  setRemoteOpen: (v: boolean) => void;
  remoteBusy: null | "fetch" | "pull" | "push";
  onRemoteAction: (kind: "fetch" | "pull" | "push") => void;
}) {
  if (!branch) return null;
  const known = ahead !== null && behind !== null;
  const same = known && ahead === 0 && behind === 0;
  return (
    <div
      data-testid="atlas-git-location"
      className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-label text-[color:var(--color-text-quaternary)]"
    >
      {/*
        Branch and remote names are proper nouns the user chose, so they are not
        translated — they are the same strings the user meets again in the
        terminal and on the repository page. The old `branchLabel` ("branch") label
        was deleted: `main → origin/main` already says what it is.

        **Four floating pieces became three** (owner, 2026-08-02: *"the branch notation is not great"* — the branch notation is not great). A separate "↑2 ↓0"
        chip used to sit next to `main → origin/main`, and the only job those
        numbers did was **tell you which button to press**. Then the numbers
        belong on the buttons — there is no reason to read them and move your eyes
        again.

        So the chip went and became `Push 2` · `Pull 3`. What remains is "where am
        I" (the branch) and "what can I do" (the three actions).
      */}
      <span className="flex min-w-0 items-center gap-1.5 font-mono">
        <span className="truncate text-[color:var(--color-text-secondary)]">{branch}</span>
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
      {upstream ? (
        <>
          {/* "identical" appears only when there are no numbers — it says why both buttons are disabled. */}
          {same ? (
            <span
              data-testid="atlas-git-divergence"
              title={t("remoteStale")}
              className="shrink-0 text-[color:var(--color-text-quaternary)]"
            >
              {t("divergeSame")}
            </span>
          ) : (
            <span data-testid="atlas-git-divergence" className="sr-only">
              {t("divergeAhead", { ahead: ahead ?? 0 })}{" "}
              {t("divergeBehind", { behind: behind ?? 0 })}
            </span>
          )}
          {/* Fetch, Pull and Push keep **the original terms**. Translating them
              makes what happens less clear, not more (owner call, 2026-08-02). */}
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
            hint={ahead && ahead > 0 ? t("remotePushHint", { ahead }) : t("remoteSameHint")}
            busy={remoteBusy === "push"}
            disabled={remoteBusy !== null}
            onClick={onRemoteAction}
          />
        </>
      ) : (
        <>
          <span aria-hidden>·</span>
          <span>{t("noUpstream")}</span>
          <button
            type="button"
            data-testid="atlas-git-remote-toggle"
            aria-expanded={remoteOpen}
            onClick={() => setRemoteOpen(!remoteOpen)}
            className={controlClass({
              shape: "chip",
              size: "md",
              className:
                "border-[color:var(--color-border-soft)] hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]",
            })}
          >
            {remoteOpen ? t("remoteToggleClose") : t("remoteToggle")}
          </button>
        </>
      )}
    </div>
  );
}

/**
 * A one-line result for a remote action — success and failure speak from the
 * **same place**.
 *
 * It lives **outside** the top bar, because attaching it inside as a wrapped line
 * makes the bar taller the moment a new line appears, dropping all three of
 * Fetch/Pull/Push down with it (owner, 2026-08-03: *"pressing fetch moves things around"* — pressing fetch moves things around). A button escaping from
 * under the finger that just pressed it is a defect, not a side effect of showing
 * a result.
 */
function RemoteResultLine({
  notice,
  error,
}: {
  notice: string | null;
  error: string | null;
}) {
  if (!error && !notice) return null;
  return (
    <p
      data-testid={error ? "atlas-git-remote-error" : "atlas-git-remote-notice"}
      className={cn(
        "git-fade-in flex-none border-b border-[color:var(--color-divider)] px-4 py-2 text-label leading-prose",
        error
          ? "text-[color:var(--color-danger-text)]"
          : "text-[color:var(--color-text-tertiary)]",
      )}
    >
      {error ?? notice}
    </p>
  );
}

/**
 * Registering a remote. **Solved at the point of failure**: when a push ends with
 * "no upstream, cannot send", the user has no idea what to do.
 *
 * Only the address the user typed is used — we never suggest, guess or autodetect
 * one (trust charter). Registering is not sending: this stores the address, and
 * the user has to press send separately.
 *
 * This is **not** a step in the connect flow — it is optional, and piling steps up
 * on this machine alone is a legitimate end state. So it **does not sit there**:
 * it opens from the location line's button. The amber left rail is gone (a
 * charter-forbidden pattern plus amber creep). What remains is one set of inputs
 * on a neutral surface, and the location line already said what this is for.
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

const STATUS_GLYPH: Record<string, string> = {
  added: "+",
  modified: "~",
  deleted: "−",
  renamed: "→",
};

const STATUS_HINT_KEY = {
  added: "markAddedHint",
  modified: "markModifiedHint",
  deleted: "markDeletedHint",
  renamed: "markRenamedHint",
} as const;

/**
 * Status is carried by **luminance** — newly created is brightest, deleted
 * faintest.
 *
 * Two reasons not to use colour: ① the charter (neutrals plus a single indigo),
 * and ② splitting add from delete along green/red is the axis red-green colour
 * blindness (about 8% of men) separates worst, while here colour would be
 * **duplicate ink** for what the glyphs (`+ ~ − →`) already carry.
 */
const STATUS_TONE: Record<string, string> = {
  added: "text-[color:var(--color-text-primary)]",
  modified: "text-[color:var(--color-text-secondary)]",
  renamed: "text-[color:var(--color-text-tertiary)]",
  deleted: "text-[color:var(--color-text-quaternary)]",
};

function StatusMark({ t, status }: { t: Translator; status: string }) {
  const hintKey = STATUS_HINT_KEY[status as keyof typeof STATUS_HINT_KEY] ?? "markModifiedHint";
  return (
    <span
      className={cn(
        "w-3 shrink-0 text-center font-mono text-label",
        STATUS_TONE[status] ?? STATUS_TONE.modified,
      )}
    >
      <span aria-hidden>{STATUS_GLYPH[status] ?? "~"}</span>
      <span className="sr-only">{t(hintKey)}</span>
    </span>
  );
}

/**
 * A change row — where defect ③ of the old screen is fixed.
 *
 * It used to be one line of `capability · added 1 · edited 2` with a list of mono
 * slugs beneath it, repeated per kind. With no hierarchy and no items it read as
 * a **build log**, and above all it **could not be pressed** — fourteen things had
 * changed and the screen offered no way to see the evidence for any one of them.
 *
 * So a row is an item, and pressing it brings that document's changed lines into
 * the evidence column. The path was not removed but **split**: the location
 * (`capabilities/`) is quaternary and the name (`git-record`) is primary — the
 * same string gains hierarchy (the slug an agent needs for handoff has to stay on
 * screen).
 *
 * Dimension regularity: height is fixed at `--git-row-h`, the name clamps, and
 * line counts sit in a fixed right column that holds its place even with no
 * value. Content length never decides the grid's rhythm.
 */
function ChangeRow({
  t,
  status,
  slug,
  path,
  index,
  selected,
  onSelect,
  delta,
  muted = false,
}: {
  t: Translator;
  status: string;
  slug: string;
  path: string;
  index: number;
  selected: boolean;
  onSelect: (path: string | null) => void;
  delta: { added: number; removed: number } | null;
  /** Non-concept files — same grammar, one step lower in weight. */
  muted?: boolean;
}) {
  const { name, place } = describeChangePath(slug, { isConcept: !muted });
  return (
    <li className="git-fade-in" style={staggerStyle(index)}>
      <button
        type="button"
        data-testid="atlas-git-change-row"
        data-selected={selected ? "true" : undefined}
        aria-pressed={selected}
        title={t("rowSelectHint")}
        onClick={() => onSelect(selected ? null : path)}
        className={cn(
          "flex h-[var(--git-row-h)] w-full items-center gap-2 rounded-[var(--radius-chip)] border-l-2 pr-1.5 pl-1.5 text-left transition-colors",
          selected
            ? "border-l-[color:var(--color-indigo-brand)] bg-[color:var(--color-overlay-2)]"
            : "border-l-transparent hover:bg-[color:var(--color-overlay-1)]",
        )}
      >
        <StatusMark t={t} status={status} />
        <span className="min-w-0 flex-1 truncate font-mono text-label">
          {/*
           * tertiary, not quaternary — **text on a pressable row cannot use the
           * flat token** (measured 2026-08-02 against alpha compositing, and
           * re-measured 2026-08-03 after quaternary was raised to #82828a).
           * quaternary (#82828a) clears 5.00:1 on `--color-panel` and 4.81:1 on
           * hover (composited with `--color-overlay-1`), but on selection
           * (composited with `--color-overlay-2`) it is **4.36:1, still below the
           * threshold**. Raising the value only got four static surfaces through;
           * this rule did not change. tertiary (#8a8f98) has room on the same two
           * backgrounds at 5.64 and 5.12.
           */}
          {place ? (
            <span className="text-[color:var(--color-text-tertiary)]">{place}/</span>
          ) : null}
          <span
            className={
              muted
                ? "text-[color:var(--color-text-tertiary)]"
                : "text-[color:var(--color-text-primary)]"
            }
          >
            {name}
          </span>
        </span>
        <span
          className="shrink-0 font-mono text-caption text-[color:var(--color-text-tertiary)]"
          title={delta ? t("numHint", { added: delta.added, removed: delta.removed }) : undefined}
        >
          {delta ? `+${delta.added} −${delta.removed}` : ""}
        </span>
      </button>
    </li>
  );
}

/**
 * The change list. **Concepts first, grouped by kind, as items.** Other files
 * collapse.
 *
 * Owner: *"what the user has to judge is which of my concepts changed, not a file list"* (what the user has to judge is which of my concepts changed, not a file list). `.codex/config.toml` and `.gitignore` are recorded along with the rest
 * but are not for reading, so they collapse by default and the collapsed row
 * states the count — nothing is hidden.
 *
 * Each number appears on screen **exactly once**: per-status totals in the section
 * head, item counts in the kind group head, line counts in the row. The same
 * number in two places forces the user to decide which one is true.
 */
function ChangeList({
  t,
  kindGroups,
  otherChanges,
  statusCounts,
  deltaByPath,
  selectedPath,
  setSelectedPath,
  othersOpen,
  setOthersOpen,
  stagedOutsideCount,
}: {
  t: Translator;
  kindGroups: AtlasGitKindGroup<GitChangeEntry>[];
  otherChanges: readonly GitChangeEntry[];
  statusCounts: ReturnType<typeof countChangesByStatus>;
  deltaByPath: Map<string, { added: number; removed: number }>;
  selectedPath: string | null;
  setSelectedPath: (v: string | null) => void;
  othersOpen: boolean;
  setOthersOpen: (v: boolean) => void;
  stagedOutsideCount: number;
}) {
  const summaryParts = [
    statusCounts.added > 0 ? t("statusAdded", { count: statusCounts.added }) : null,
    statusCounts.modified > 0 ? t("statusModified", { count: statusCounts.modified }) : null,
    statusCounts.deleted > 0 ? t("statusDeleted", { count: statusCounts.deleted }) : null,
    statusCounts.renamed > 0 ? t("statusRenamed", { count: statusCounts.renamed }) : null,
  ].filter(Boolean);

  let rowIndex = 0;

  return (
    <div data-testid="atlas-git-change-groups" className="flex min-w-0 shrink-0 flex-col gap-2">
      {/* This line is this block's **only** title. The evidence column head
          carried the same `changesTitle`, so the identical string appeared twice
          32px apart — three times counting the "now" row on the left timeline —
          and the user had to decide which was true. The chosen document's path
          was folded into this line's right end. */}
      <div className="flex shrink-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <SectionLabel>{t("changesTitle")}</SectionLabel>
        <span className="text-label text-[color:var(--color-text-secondary)]">
          {summaryParts.join(" · ")}
        </span>
        <span className="ml-auto min-w-0 truncate font-mono text-caption text-[color:var(--color-text-quaternary)]">
          {selectedPath ?? t("diffAllLabel")}
        </span>
      </div>

      <div>
        {kindGroups.length > 0 ? (
          <ul className="flex flex-col">
            {kindGroups.map((group) => (
              <li key={group.kind ?? "__other"} className="flex flex-col">
                <p className="flex h-[var(--git-row-h)] shrink-0 items-center gap-1.5 pl-1.5 text-label text-[color:var(--color-text-quaternary)]">
                  <span className="font-[var(--font-weight-signature)] text-[color:var(--color-text-tertiary)]">
                    {group.kind ?? t("kindOther")}
                  </span>
                  <span aria-hidden>{group.counts.total}</span>
                  <span className="sr-only">
                    {t("conceptsCount", { count: group.counts.total })}
                  </span>
                </p>
                <ul className="flex flex-col">
                  {group.entries.map((entry) => (
                    <ChangeRow
                      key={entry.path}
                      t={t}
                      status={entry.status}
                      slug={entry.slug}
                      path={entry.path}
                      index={rowIndex++}
                      selected={selectedPath === entry.path}
                      onSelect={setSelectedPath}
                      delta={deltaByPath.get(entry.path) ?? null}
                    />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : null}

        {otherChanges.length > 0 ? (
          <div className="flex flex-col">
            <button
              type="button"
              data-testid="atlas-git-others-toggle"
              aria-expanded={othersOpen}
              onClick={() => setOthersOpen(!othersOpen)}
              className="flex h-[var(--git-row-h)] shrink-0 items-center gap-1 rounded-[var(--radius-chip)] pr-2 pl-0.5 text-label text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-secondary)]"
            >
              <ChevronRight
                size={ICON_SIZE.sm}
                aria-hidden
                className={cn("shrink-0 transition-transform", othersOpen && "rotate-90")}
              />
              {t("othersTitle", { count: otherChanges.length })}
            </button>
            {othersOpen ? (
              <div className="git-fade-in flex flex-col gap-1 pb-1">
                <p className="pl-4 text-caption leading-label text-[color:var(--color-text-quaternary)]">
                  {t("othersHint")}
                </p>
                <ul className="flex flex-col">
                  {otherChanges.map((entry, index) => (
                    <ChangeRow
                      key={entry.path}
                      t={t}
                      status={entry.status}
                      slug={entry.slug}
                      path={entry.path}
                      index={index}
                      selected={selectedPath === entry.path}
                      onSelect={setSelectedPath}
                      delta={deltaByPath.get(entry.path) ?? null}
                      muted
                    />
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {stagedOutsideCount > 0 ? (
          <p className="pt-1 pl-1.5 text-caption text-[color:var(--color-text-quaternary)]">
            {t("stagedOutsideNotice", { count: stagedOutsideCount })}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Changed lines — evidence with the git plumbing removed.
 *
 * The old screen dumped raw `git diff` into a `<pre>`: `diff --git a/… b/…`,
 * `index 4a1c0de..8b71f92 100644`, `--- a/…`, `+++ b/…`, `@@ -12,6 +12,9 @@`. Of
 * that, only **the added and removed lines** are what a person judges by; the rest
 * is a tool talking to a tool, and the file's identity was already stated by the
 * list row.
 *
 * `@@` is not discarded but turned into **a single dashed line** — the user has to
 * know there are lines in between that are not shown (hiding the elision makes the
 * diff lie), but not its coordinates.
 */
function DiffView({
  t,
  files,
  showFileHeads,
}: {
  t: Translator;
  files: AtlasGitDiffFile[];
  showFileHeads: boolean;
}) {
  return (
    <div
      data-testid="atlas-git-diff-pre"
      // Below `xl` evidence stacks under the list, so it scrolls inside its own
      // cap. At `xl` the **evidence column is the single scroll owner**, so
      // nothing is clipped again here (clipping would silently swallow rows — the
      // measured accident described in the column comment above).
      className="git-fade-in flex shrink-0 flex-col gap-3 pr-1 max-xl:max-h-[var(--git-evidence-stack-max)] max-xl:overflow-auto"
    >
      {files.map((file) => {
        const { name, place } = describeChangePath(file.path, { isConcept: true });
        return (
          <div key={file.path} className="flex flex-col gap-1">
            {showFileHeads ? (
              <p className="flex items-baseline gap-2 font-mono text-caption">
                <span className="min-w-0 truncate">
                  <span className="text-[color:var(--color-text-quaternary)]">
                    {place ? `${place}/` : ""}
                  </span>
                  <span className="text-[color:var(--color-text-secondary)]">{name}</span>
                </span>
                <span
                  className="shrink-0 text-[color:var(--color-text-quaternary)]"
                  title={t("numHint", { added: file.added, removed: file.removed })}
                >
                  {`+${file.added} −${file.removed}`}
                </span>
              </p>
            ) : null}
            <ol className="flex flex-col">
              {file.lines.map((line, index) =>
                line.kind === "skip" ? (
                  <li
                    key={`skip-${String(index)}`}
                    className="flex h-[var(--git-row-h)] shrink-0 items-center px-1"
                  >
                    <span
                      aria-hidden
                      className="w-full border-t border-dashed border-[color:var(--color-border-soft)]"
                    />
                    <span className="sr-only">{t("diffSkippedHint")}</span>
                  </li>
                ) : (
                  <li
                    key={`${line.kind}-${String(index)}`}
                    className={cn(
                      "flex items-start gap-1.5 border-l-2 pr-1.5 pl-1 font-mono text-label leading-prose",
                      line.kind === "added"
                        ? "border-l-[color:var(--color-border-strong)] bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-primary)]"
                        : line.kind === "removed"
                          ? // A deleted row is faintest but **must stay
                            // readable** — measured 4.37:1 (quaternary on
                            // overlay-1) fails AA, so it was raised to tertiary
                            // (5.86:1). The luminance order (added > modified >
                            // renamed > deleted) still holds.
                            "border-l-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] text-[color:var(--color-text-tertiary)]"
                          : "border-l-transparent text-[color:var(--color-text-tertiary)]",
                    )}
                  >
                    <span aria-hidden className="w-2 shrink-0 text-center select-none">
                      {line.kind === "added" ? "+" : line.kind === "removed" ? "−" : ""}
                    </span>
                    <span className="min-w-0 break-words whitespace-pre-wrap">
                      {line.text === "" ? " " : line.text}
                    </span>
                  </li>
                ),
              )}
            </ol>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Past steps — "when did which meaning change".
 *
 * The old screen drew commit subjects raw: `ontology snapshot: +3 concepts,
 * ~2 updated (capabilities/map-label-budget, domains/topology, …)`. But that
 * string is **ours**, and letting it be read raw on a Korean screen means we did
 * not translate a string we wrote ourselves. Human commits and other tools'
 * commits are left untouched, because there the raw text *is* the person's words
 * (`matched:false`).
 *
 * The raw text does not disappear — it stays in the expanded detail with the full
 * hash and timestamp. That is the audit trail, and the string the user will meet
 * again in the terminal.
 *
 * Dimension regularity: the time is a fixed-width column, the summary and names
 * each clamp to one line, and a step with no names still holds that line's place
 * (height `--git-step-h`).
 */
/**
 * How many names one step row shows. **A fixed count plus a remainder caption** —
 * "as many as fit" would let content length set a repeated set's rhythm
 * (dimension regularity).
 */
const STEP_CONCEPT_SLOTS = 2;

/**
 * One list row's grammar — **a row in a full-width table**, not a card.
 *
 * It used to be a `rounded-chip` card with a 2px indigo bar on its left, which is
 * the «full-height coloured rail inside a card» `design.md` forbids by name (it
 * reads as an AI SaaS callout — owner, 2026-08-02). The same 2px on a **row that
 * reaches the column's edge** reads as a table's selection marker. What changed is
 * not the value but **where the value sits**.
 *
 * The three columns (time · name · why) are exactly as measured on the mockup.
 */
const STEP_ROW =
  "grid w-full grid-cols-[var(--git-when-w)_minmax(0,1.7fr)_minmax(0,1fr)] min-h-[var(--git-row-h)] items-center gap-3 border-b border-l-2 border-b-[color:var(--color-divider)] px-4 py-2 text-left transition-colors hover:bg-[color:var(--color-overlay-1)]";

function StepList({
  t,
  history,
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
  /**
   * Step hash → the **vault concepts** that step changed. Not a guess parsed from
   * the commit subject, but the kind/slug shipped by #842 matched against the graph.
   */
  concepts: ReadonlyMap<string, readonly { id: string; label: string; kind: string }[]>;
  /** Hash of the commit just recorded — only that one row gets the settle ramp. */
  settledHash?: string | null;
  /**
   * Number of not-yet-committed changes. At 0 the row is not drawn — leaving a
   * slot for something absent makes the list read as "something is missing".
   */
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
   * **No tabs.** Splitting "not sent yet", "to receive" and "do not commit" into tabs
   * makes each tab hide the others, and this repository already has a decision
   * against that plus a test that holds it ("commit history never hides behind a tab") —
   * commit history never hides behind a tab). The three states are **different
   * stretches of one timeline**, so order already states the relation; what is
   * needed is a boundary, not a partition.
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
    <ul data-testid="atlas-git-steps" className="flex flex-col">
      {behind && behind > 0 ? (
        <li>
          <button
            type="button"
            data-testid="atlas-git-behind-row"
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
      {/*
        Uncommitted changes are like a commit in that they are also a **change
        bundle**; the only difference is that they have no name yet. So they use
        the same row grammar, and the distinction is carried by line style
        (dashed) and the time ("now"). No new colour.
      */}
      {pendingCount > 0 ? (
        <li>
          <button
            type="button"
            data-testid="atlas-git-pending-row"
            /*
             * **`aria-current`, not `aria-pressed`** (2026-08-15 (8)). This row
             * points at "what I am currently looking at" in a master-detail list;
             * it is not a pressed button. The sibling commit rows already use
             * `aria-expanded`, so pressed here would **split one list across two
             * vocabularies**. Planting a radiogroup is not the answer either
             * (that makes three).
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
            {/* A pressable row means tertiary (the alpha-compositing rationale in
                the `ChangeRow` comment above). Selected, this line sat on
                overlay-2 at 3.97:1. */}
            <span className="truncate text-label text-[color:var(--color-text-tertiary)]">
              {t("pendingHint", { count: pendingCount })}
            </span>
          </button>
        </li>
      ) : null}
      {history.map((commit, index) => {
        const summary = describeSnapshotSubject(commit.subject);
        const parts = [
          summary.added > 0 ? t("statusAdded", { count: summary.added }) : null,
          summary.updated > 0 ? t("statusModified", { count: summary.updated }) : null,
          summary.renamed > 0 ? t("statusRenamed", { count: summary.renamed }) : null,
          summary.removed > 0 ? t("statusDeleted", { count: summary.removed }) : null,
        ].filter(Boolean);
        const headline = summary.matched
          ? parts.length > 0
            ? parts.join(" · ")
            : t("stepNoConcepts")
          : commit.subject;
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
            // Only the row just recorded gets the settle signature — re-birthing
            // history that was already there blurs what just happened.
            className={stepRowMotionClass(commit.hash, settledHash)}
            style={stepRowUsesStagger(commit.hash, settledHash) ? staggerStyle(index) : undefined}
          >
            <button
              type="button"
              data-testid="atlas-git-history-item"
              aria-expanded={expanded}
              title={t("stepSelectHint")}
              onClick={() => setSelection({ kind: "commit", hash: commit.hash })}
              className={cn(STEP_ROW, "border-l-transparent aria-expanded:border-l-[color:var(--color-indigo-brand)] aria-expanded:bg-[color:var(--color-overlay-2)]")}
            >
              <span className="truncate text-label tabular-nums text-[color:var(--color-text-tertiary)]">
                {commit.relativeTime}
              </span>
              {/* The subject is the **concept**. Only a step that touched no
                  concepts falls back to the summary or the raw subject — leaving
                  the line blank makes the step unidentifiable. */}
              <span className="flex min-w-0 items-center gap-2.5 truncate text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
                {stepConcepts.length > 0 ? (
                  <>
                    {stepConcepts.slice(0, STEP_CONCEPT_SLOTS).map((concept) => (
                      <span key={concept.id} className="inline-flex min-w-0 shrink items-center gap-1.5">
                        <TopologyV2KindGlyph kind={concept.kind} size={12} />
                        <span className="truncate">{concept.label}</span>
                      </span>
                    ))}
                    {stepConcepts.length > STEP_CONCEPT_SLOTS ? (
                      <span className="shrink-0 text-label font-normal text-[color:var(--color-text-quaternary)]">
                        {t("moreSlugs", { count: stepConcepts.length - STEP_CONCEPT_SLOTS })}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="truncate">{headline}</span>
                )}
              </span>
              {/* The third column is **why**. It is not stacked into two lines
                  because a list's job is scanning, and with one row of three
                  columns time, name and reason align vertically so the eye runs
                  down each column (mockup row height measured at 36px). */}
              <span className="truncate text-label text-[color:var(--color-text-tertiary)]">
                {stepConcepts.length > 0
                  ? commit.subject
                  : names && trail
                    ? `${names} · ${trail}`
                    : names || trail || " "}
              </span>
            </button>
          </li>
          </Fragment>
        );
      })}
    </ul>
  );
}

/**
 * A one-line result for recording.
 *
 * ICU argument fix (2026-07-26) — the copy sheet wants
 * `{count}`/`{upstream}`/`{remote}`, while the caller passed only `{subject}` or
 * nothing at all. next-intl renders the **key path** (`atlasGit.snapshotDone`)
 * instead of the sentence when arguments are missing, so at the very moment a
 * record succeeded the user was reading a developer string.
 *
 * `counts` is a Rust payload, so a missing field kills the whole render. One
 * result sentence must not bring the screen down, hence the fallback to the
 * list's counts.
 */
function SnapshotResultLine({
  t,
  result,
  fallbackCount,
}: {
  t: Translator;
  result: GitSnapshotResult;
  fallbackCount: number;
}) {
  const count = result.counts?.total ?? fallbackCount;
  const remote = result.push?.remoteUrl ?? "";
  return (
    <p
      className="git-fade-in text-caption text-[color:var(--color-text-tertiary)]"
      data-testid="atlas-git-snapshot-result"
    >
      {result.committed ? t("snapshotDone", { count }) : t("snapshotNoChanges")}
      {result.push
        ? ` · ${
            result.push.pushed
              ? t("pushDone", { count, upstream: remote })
              : t("pushFailed", { count, remote })
          }`
        : null}
    </p>
  );
}

/**
 * The bottom dock — where this screen's **verb** lives (the prescription for
 * defect ④).
 *
 * On the old screen `Keep 14` was an 11px ghost-outline button floating at the
 * end of the list. It is the **only decision** anyone comes to this page to make,
 * and it was the quietest thing on screen. Now it is pinned to the bottom of the
 * column (`mt-auto`), so it stays in the same place however long the list gets,
 * and it carries this surface's maximum weight with a filled indigo and
 * `text-body`.
 *
 * The recording-scope notice moved down here for the same reason — trust copy is
 * a promise that has to be read **at the decision point**, not decoration under a
 * page title.
 *
 * The mono line on the confirm step stays: that is the one place the user has to
 * see **the string that will actually be recorded**, so the English there is a
 * value, not a plumbing leak.
 */
function ActionDock({
  t,
  onConnectRemote,
  hasChanges,
  changeCount,
  predictedSubject,
  confirming,
  setConfirming,
  pushOptIn,
  setPushOptIn,
  snapshotting,
  snapshotResult,
  snapshotError,
  confirmSnapshot,
  upstream,
  snapshotMessage,
  setSnapshotMessage,
}: {
  t: Translator;
  /** The input the dock's last line opens when there is no remote. */
  onConnectRemote: () => void;
  hasChanges: boolean;
  changeCount: number;
  predictedSubject: string;
  confirming: boolean;
  setConfirming: (v: boolean) => void;
  pushOptIn: boolean;
  setPushOptIn: (v: boolean) => void;
  snapshotting: boolean;
  snapshotResult: GitSnapshotResult | null;
  snapshotError: string | null;
  confirmSnapshot: () => void;
  upstream: string | null;
  /** A subject the user typed. Empty falls back to the automatic wording. */
  snapshotMessage: string;
  setSnapshotMessage: (v: string) => void;
}) {
  return (
    <div
      data-testid="atlas-git-dock"
      className="mt-auto flex shrink-0 flex-col gap-2 border-t border-[color:var(--color-divider)] pt-3"
    >
      {confirming ? (
        <div className="git-fade-in flex flex-col gap-2" data-testid="atlas-git-confirm-step">
          <p className="text-caption text-[color:var(--color-text-tertiary)]">{t("confirmBody")}</p>
          {/*
            The subject is **editable.** The automatic wording says what changed
            well but never why, and why is what someone reading the history later
            looks for. Leaving it empty keeps the automatic wording as before, so
            the path for someone who did nothing is unchanged (the placeholder
            shows that exact value).
          */}
          <input
            type="text"
            data-testid="atlas-git-message-input"
            value={snapshotMessage}
            onChange={(event) => setSnapshotMessage(event.target.value)}
            placeholder={predictedSubject}
            aria-label={t("messageLabel")}
            className={fieldClass({ multiline: true, size: "md", className: "w-full font-mono text-label break-all" })}
          />
          <Checkbox
            data-testid="atlas-git-push-optin"
            checked={pushOptIn}
            disabled={!upstream}
            onChange={(event) => setPushOptIn(event.target.checked)}
            label={t("pushOptIn")}
          />
          <p className="text-caption text-[color:var(--color-text-quaternary)]">
            {upstream ? t("pushOptInHint", { upstream }) : t("pushNoUpstream")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="atlas-git-confirm-button"
              disabled={snapshotting}
              onClick={confirmSnapshot}
              className={PRIMARY_ACTION_CLASS}
            >
              {snapshotting ? t("snapshotRunning") : t("confirmButton")}
            </button>
            <button
              type="button"
              data-testid="atlas-git-cancel-button"
              disabled={snapshotting}
              onClick={() => setConfirming(false)}
              className={SECONDARY_ACTION_CLASS}
            >
              {t("cancelButton")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          data-testid="atlas-git-snapshot-button"
          disabled={!hasChanges}
          onClick={() => setConfirming(true)}
          className={cn(hasChanges ? PRIMARY_ACTION_CLASS : DOCK_INERT_CLASS, "self-start")}
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
        <SnapshotResultLine t={t} result={snapshotResult} fallbackCount={changeCount} />
      ) : null}

      {/*
        The last line of the write position states **the next step from the
        current state**.

        With no remote, recorded steps live only on this computer — that is the
        fact to know now, and the next step is connecting. This position used to
        always hold the scope notice alone, which also appeared in the header, so
        the same sentence appeared twice (owner) while "so what do I do now" was
        nowhere.
      */}
      {upstream ? (
        <p className="flex items-center gap-1.5 text-caption leading-label text-[color:var(--color-text-quaternary)]">
          <ShieldCheck size={ICON_SIZE.sm} aria-hidden className="shrink-0" />
          {t("scopeNotice")}
        </p>
      ) : (
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
            className={controlClass({
              shape: "chip",
              size: "sm",
              className:
                "border-[color:var(--color-border-soft)] hover:border-[color:var(--color-indigo-a46)] hover:text-[color:var(--color-text-primary)]",
            })}
          >
            {t("dockConnectRemote")}
          </button>
        </p>
      )}
    </div>
  );
}

function DesktopBody({
  t,
  commitDiff,
  snapshotMessage,
  setSnapshotMessage,
  stage,
  hostPlatformHint,
  onRecheckGit,
  loadErrorText,
  status,
  kindGroups,
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
  snapshotError,
  confirmSnapshot,
  onRetry,
  selection,
  setSelection,
  diffFiles,
  history,
  selectedPath,
  setSelectedPath,
  othersOpen,
  setOthersOpen,
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
}: {
  snapshotMessage: string;
  setSnapshotMessage: (v: string) => void;
  /** The chosen step's patch — `null` is "not known yet", `""` is "none". */
  commitDiff: string | null;
  /** `navigator.platform ?? userAgent` — the hint that picks per-platform install guidance. */
  hostPlatformHint: string;
  /** "re-check" (re-check) — so someone who just installed git need not restart the app. */
  onRecheckGit: () => void;
  t: Translator;
  stage: Extract<GitStage, "loading" | "not-installed" | "error" | "not-initialized" | "workbench">;
  loadErrorText: string | null;
  status: GitStatusResult | null;
  kindGroups: AtlasGitKindGroup<GitChangeEntry>[];
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
  snapshotError: string | null;
  confirmSnapshot: () => void;
  onRetry: () => void;
  selection: WorkbenchSelection;
  setSelection: (v: WorkbenchSelection) => void;
  diffFiles: AtlasGitDiffFile[];
  history: GitCommitInfo[];
  selectedPath: string | null;
  setSelectedPath: (v: string | null) => void;
  othersOpen: boolean;
  setOthersOpen: (v: boolean) => void;
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
  remoteBusy: null | "fetch" | "pull" | "push";
  onRemoteAction: (kind: "fetch" | "pull" | "push") => void;
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
   * Hash of the commit just recorded — **only that one row** in the past-steps
   * list settles with the confirmation ramp (`--motion-settle`). It is the largest
   * confirmation on this surface, and before this only a one-line result arrived
   * on a 120ms fade: you could tell something was written, but nothing showed
   * **where it landed**.
   *
   * Every other row is untouched — re-birthing history that was already there
   * blurs what just happened. The key is the commit hash, so existing rows reuse
   * their DOM and the animation does not replay.
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
     * Fill the degradation card's three elements exactly (`surfaces.md`) —
     * **zero new strings**.
     * ① why: `install.title` / `install.body`
     * ② where: the per-platform command (copyable) plus download link from
     *    `gitInstallGuide(platform)`
     * ③ re-check: `install.recheck`
     *
     * Never write "coming soon" — what does not work today is stated as not
     * working, with somewhere to go instead. External links carry a leading `↗` as
     * a pre-click warning (design.md).
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
    // S2 — the screen that opens the dead end the owner hit (2026-07-25).
    //
    // The old code ended at "Atlas does not run git init for you — run it in the
    // terminal", with nothing to press, so the user had to leave the app. What the
    // charter forbids is **automatic** execution, not a user pressing a button in a
    // folder they chose themselves (owner decision plus a Guardian ruling).
    // Automatic execution is still zero — `onInit` is called only from this
    // button's onClick, and init does not chain into a commit (an empty repository
    // lands on "N changes not yet recorded").
    //
    // 2026-07-26 — from full-width top-left alignment to the setup frame. The user
    // has one job in this moment, and the screen must say one thing.
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
          {/* How to undo it (`initEscape`) belongs to the stage's last line
              (`note`) — it is what a first-time user fears most, so it has to be
              **immediately before** the action, and repeating it here would say
              the same thing twice. */}

          {/*
           * Even without git, **what changed this time is known** — the per-vault
           * baseline survives a reload. This summary used to be drawn only in the
           * web degradation, so someone who had not turned git on was offered
           * "start" and never saw what had changed. Withholding what you already
           * know is an omission, not a degradation (owner, 2026-08-02).
           */}
          <SessionChangeSummary
            t={t}
            changeset={sessionChangeset}
            title={t("initSessionTitle")}
          />
        </div>
      </SetupFrame>
    );
  }

  // ── Workbench ──────────────────────────────────────────────────────────
  const upstream = status?.upstream ?? null;
  const showRemoteSetup = remoteOpen && !upstream;
  const deltaByPath = new Map(
    diffFiles.map((file) => [file.path, { added: file.added, removed: file.removed }]),
  );
  const shownDiffFiles = selectedPath
    ? diffFiles.filter((file) => file.path === selectedPath)
    : diffFiles;

  const locationLine = (
    <LocationLine
      t={t}
      branch={status?.branch ?? null}
      upstream={upstream}
      ahead={status?.ahead ?? null}
      behind={status?.behind ?? null}
      remoteOpen={remoteOpen}
      setRemoteOpen={setRemoteOpen}
      remoteBusy={remoteBusy}
      onRemoteAction={onRemoteAction}
    />
  );

  const dock = (
    <ActionDock
      t={t}
      onConnectRemote={() => setRemoteOpen(true)}
      hasChanges={hasChanges}
      changeCount={changeCount}
      predictedSubject={predictedSubject}
      confirming={confirming}
      setConfirming={setConfirming}
      pushOptIn={pushOptIn}
      setPushOptIn={setPushOptIn}
      snapshotting={snapshotting}
      snapshotResult={snapshotResult}
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
   * The old `recall` branch (a single column when there is nothing to record) was
   * removed.
   *
   * That branch was **a judgement made before the two-column switch**: back then
   * the right side was "evidence" (evidence), so with zero uncommitted changes there
   * really was nothing to show. Now the right side is **the detail of what is
   * selected**, and choosing a commit fills it with changed concepts, the ego
   * drawing and the changed content. While the branch survived, a vault with four
   * commits lost half the screen outright and looked nothing like the mockup
   * (owner measurement, 2026-08-02).
   *
   * There is one shape. Whether anything is uncommitted shows up only as the
   * presence or absence of the list's top row.
   */
  // `decide` — there is something to record. Left: what changed and what to
  // record. Right: the evidence. The evidence column's minimum width is
  // `--git-evidence-min` (600px) because 80 columns of 11px mono ≈ 528px plus
  // gutter and padding. Mockup v1's 420px clipped every line, and **a clipped diff
  // is not evidence**. Below `lg` the two stack (evidence under the list).
  /*
   * The right column is no longer "evidence" but **the detail of what is selected**,
   * so its existence condition changed too: it used to be "is there a diff or
   * history to show", and now the change list lives in this column as well, so the
   * column has to exist **whenever there is something to commit**.
   *
   * Keeping the old rule (`diffFiles.length > 0`) makes the change list vanish
   * entirely the moment only newly created documents changed, because there is
   * nothing prior to compare and the diff is 0 lines.
   */
  const showEvidence = statusCounts.total > 0 || diffFiles.length > 0 || history.length > 0;

  return (
    <div
      data-testid="atlas-git-workbench"
      data-shape="decide"
      className="git-fade-in flex min-h-0 flex-1 flex-col"
    >
      {/*
        Rebuilt to the mockup's structure (2026-08-02). Three things differed when
        measured against it:

        ① **There was a card shell.** The mockup has none, while the real work
           surface was wrapped in `border + surface + p-4`. When one route is a
           whole surface, that border is not a boundary but **ink** — it reads as a
           screen inside a screen.
        ② **Height matched content only.** The mockup's body is 749px (to the
           floor), while in practice a short list left half the screen empty. The
           workbench is a surface that **holds position**, so it fills the viewport
           and scrolls inside.
        ③ **The header was a separate block.** The mockup is a single 57px top bar
           (title · location · actions), separated from the body by one divider.
      */}
      <div className="flex flex-none flex-wrap items-center gap-x-3 gap-y-2 border-b border-[color:var(--color-divider)] px-1 pb-3">
        <PageHeader t={t} inColumn showScope={false} />
        <div className="ml-auto flex min-w-0 items-center gap-3">{locationLine}</div>
      </div>
      <RemoteResultLine notice={remoteActionNotice} error={remoteActionError} />

      {/* Body — down to the floor. The two columns are separated by a divider and scroll independently. */}
      <div
        className={cn(
          "grid min-h-0 flex-1 grid-cols-1",
          showEvidence
            ? "xl:grid-cols-[minmax(0,var(--git-timeline-w))_minmax(0,1fr)]"
            : "mx-auto w-full max-w-[var(--git-single-measure)]",
        )}
      >
        <div className="flex min-w-0 flex-col xl:min-h-0 xl:border-r xl:border-[color:var(--color-divider)]">
          {remotePanel ? <div className="flex-none px-4 pt-3">{remotePanel}</div> : null}
          {/* List head — the mockup's `lhead`. With nothing to commit it does not
              repeat what the dock says ("all committed") but states **what the
              current state actually is**. */}
          {!hasChanges ? (
            <p className="flex-none border-b border-[color:var(--color-divider)] px-4 py-3 text-label leading-prose text-[color:var(--color-text-tertiary)]">
              {t("noChangesHint")}
            </p>
          ) : null}
          <div className="min-h-0 xl:flex-1 xl:overflow-y-auto">
            <StepList
              t={t}
              history={history}
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
          </div>
          {dock ? <div className="flex-none px-4 pb-3">{dock}</div> : null}
        </div>

        {showEvidence ? (
          <div
            data-testid="atlas-git-evidence"
            /*
             * **This one column is the scroll region** (measurement correction,
             * 2026-08-02).
             *
             * The change list and the changed lines were each `flex-1`, which split
             * the column's height in half regardless of content. Measured at
             * 1512×806: 208px of list content in a 180px window meant **52px was
             * silently clipped**, and what got clipped happened to be the `domain`
             * group's only row and the "other files N items" toggle — the screen said
             * "domain 1" and did not show that 1, and the only door to non-concept
             * files ceased to exist.
             *
             * A silent clip is worse than a gap (the user cannot tell which rows
             * they lost). One column, one scroll, and there is nowhere to clip.
             */
            className="flex min-w-0 flex-col xl:min-h-0 xl:overflow-y-auto"
          >
            {/*
              The right side draws **the one thing chosen on the left**. Selection,
              not a tab, decides what is shown — the structure states "what am I
              looking at" by itself, so no tab label has to be read to find out.
            */}
            {selection.kind === "pending" ? (
              <>
                <div className="flex flex-col gap-2 px-5 py-4">
                <ChangeList
                  t={t}
                  kindGroups={kindGroups}
                  otherChanges={otherChanges}
                  statusCounts={statusCounts}
                  deltaByPath={deltaByPath}
                  selectedPath={selectedPath}
                  setSelectedPath={setSelectedPath}
                  othersOpen={othersOpen}
                  setOthersOpen={setOthersOpen}
                  stagedOutsideCount={status?.stagedOutsideVault.length ?? 0}
                />
                {shownDiffFiles.length > 0 ? (
                  <DiffView
                    t={t}
                    files={shownDiffFiles}
                    showFileHeads={!selectedPath && shownDiffFiles.length > 1}
                  />
                ) : (
                  <p className="git-fade-in text-label leading-prose text-[color:var(--color-text-quaternary)]">
                    {t("diffEmpty")}
                  </p>
                )}
                </div>
              </>
            ) : (
              (() => {
                const picked = history.find((c) => c.hash === selection.hash);
                if (!picked) return null;
                return (
                  <CommitDetail
                    t={t}
                    hash={picked.hash}
                    isoTime={picked.isoTime}
                    relativeTime={picked.relativeTime}
                    subject={picked.subject}
                    concepts={concepts.get(picked.hash) ?? []}
                    files={picked.files ?? []}
                    diff={commitDiff}
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
