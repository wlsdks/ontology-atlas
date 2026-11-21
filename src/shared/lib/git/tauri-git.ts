import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';

import { type NativeErrorLookup, nativeErrorMessage } from '../desktop-shell/native-error';

/**
 * Typed wrappers over the Tauri commands in `src-tauri/src/git/`, which owns the contract. The
 * trust invariants of `git.rs` hold here too: push and pull only on explicit opt-in, no automatic
 * `git init`, and every call follows a user click. Without Tauri every wrapper returns `null`.
 * Expected failures reject with a string that `gitErrorMessage` turns into one line.
 */

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function getInvoke(): TauriInvoke | null {
  if (typeof window === 'undefined') return null;
  if (!isTauri()) return null;
  return (command, args) => tauriInvoke(command, args);
}

type GitChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed';

export interface GitNodeRevisionRef {
  slug: string;
  isoTime: string;
  revision: string;
}

export async function gitNodeRevisions(vaultPath: string, slug: string): Promise<GitNodeRevisionRef[] | null> {
  const invoke = getInvoke();
  return invoke ? invoke<GitNodeRevisionRef[]>('vault_node_revisions', { vaultPath, slugs: [slug] }) : null;
}

export async function gitNodeRevisionContent(vaultPath: string, reference: GitNodeRevisionRef): Promise<string | null> {
  const invoke = getInvoke();
  return invoke ? invoke<string | null>('vault_node_revision_content', {
    vaultPath, slug: reference.slug, revision: reference.revision,
  }) : null;
}

/** Rust `ChangeEntry` (serde camelCase). */
export interface GitChangeEntry {
  path: string;
  status: GitChangeStatus;
  kind: string | null;
  slug: string;
  renamedFrom: string | null;
}

/** Rust `SnapshotCounts`. */
interface GitSnapshotCounts {
  added: number;
  modified: number;
  deleted: number;
  renamed: number;
  total: number;
}

/** Rust `GitStatusResult`. */
export interface GitStatusResult {
  initialized: boolean;
  repoRoot: string | null;
  branch: string | null;
  /** Upstream ref (e.g. origin/main); `null` means push is unavailable. */
  upstream: string | null;
  changedCount: number;
  /** `[ahead, behind]` as of the last fetch; both `null` with no upstream. */
  ahead: number | null;
  behind: number | null;
  /** Already-staged paths outside the vault; the snapshot leaves them alone (informational). */
  stagedOutsideVault: string[];
  /**
   * Whether a remote named `origin` exists, read locally. Absent means unknown, never "no remote": an
   * older bridge does not send it.
   */
  hasOrigin?: boolean;
  /** HEAD names a commit, not a branch; `branch` then reads `HEAD`. Absent means unknown. */
  detached?: boolean;
  /** Short hash of the commit HEAD names; `null` before the first commit. Absent means unknown. */
  headShortHash?: string | null;
  /** Full HEAD identity for a push bound to this status read. */
  headHash?: string | null;
}

/** Rust `PushOutcome` — a failed push is guidance, not a crash: the commit is already local. */
interface GitPushOutcome {
  pushed: boolean;
  remoteUrl: string | null;
  message: string | null;
  guidance: string | null;
}

interface GitPushOnlyOutcome {
  pushed: boolean;
  upstreamSet: boolean;
  message: string | null;
  guidance: string | null;
}

/** Push the displayed commit without adding or committing any working files. */
export async function gitPushOnly(
  vaultPath: string,
  expectedBranch: string,
  expectedHead: string,
  expectedUpstream: string | null,
  setUpstream: boolean,
): Promise<GitPushOnlyOutcome | null> {
  const invoke = getInvoke();
  return invoke ? invoke<GitPushOnlyOutcome>('git_push_only', {
    vaultPath, expectedBranch, expectedHead, expectedUpstream, setUpstream,
  }) : null;
}

/** Rust `GitSnapshotResult`. */
export interface GitSnapshotResult {
  committed: boolean;
  /** `"no-changes"`, or `null` when a commit was made. */
  reason: string | null;
  commitHash: string | null;
  subject: string | null;
  summary: string | null;
  counts: GitSnapshotCounts;
  files: GitChangeEntry[];
  stagedOutsideVault: string[];
  /** Populated only when push was opted into. */
  push: GitPushOutcome | null;
}

/** Rust `GitCommitInfo`. */
export interface GitCommitInfo {
  shortHash: string;
  hash: string;
  subject: string;
  relativeTime: string;
  isoTime: string;
  /** `kind` is read from the file on disk now, so it is `null` for deleted files. */
  files: GitChangeEntry[];
}

/** Rust `GitFetchResult` — fetch only; the working tree is not touched. */
export interface GitFetchResult {
  ok: boolean;
  /** Upstream ref; empty string plus `ok: false` when there is none. */
  upstream: string;
  /** Divergence re-measured **immediately after** the fetch. */
  ahead: number | null;
  behind: number | null;
  summary: string;
}

/** Rust `GitDiffResult`. */
export interface GitDiffResult {
  count: number;
  files: GitChangeEntry[];
  /** Text diff of tracked files; untracked new files appear only in `files`. */
  diff: string;
  tooLarge: boolean;
}

/** Rust `GitPullResult`. */
export interface GitPullResult {
  ok: boolean;
  upstream: string;
  summary: string;
}

/** Rust `GitInitResult`. */
export interface GitInitResult {
  initialized: boolean;
  /** `'already'` when it was already a repo, `null` when it was just started. */
  reason: string | null;
  repoRoot: string;
  branch: string | null;
  changedCount: number;
}

/** Rust `GitSetRemoteResult`. */
export interface GitSetRemoteResult {
  ok: boolean;
  /** Always `'origin'`. */
  remote: string;
  url: string;
  /** The previous URL, when this call replaced an existing one. */
  replaced: string | null;
}

/** Rust `GitProbe` — does this machine have git. */
export interface GitProbeResult {
  installed: boolean;
  /** Raw `git --version` output — shown to the user verbatim. */
  version: string | null;
  platform: 'macos' | 'windows' | 'linux';
}

/**
 * Read-only check that git is installed; a typed signal lets the UI choose platform-specific install
 * guidance.
 */
export async function gitProbe(): Promise<GitProbeResult | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<GitProbeResult>('git_probe');
}

/** Whether the Tauri git IPC is available; false takes the web degradation path. */
export function isGitBridgeAvailable(): boolean {
  return getInvoke() !== null;
}

/**
 * Start tracking this folder (`git init`) only when the user presses it; never call automatically.
 * The Rust side only inits, it never chains into add, commit or push.
 */
export async function gitInit(vaultPath: string): Promise<GitInitResult | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<GitInitResult>('git_init', { vaultPath });
}

/**
 * Pass only a URL the user typed; never suggest or detect one. Registering sends nothing: a push
 * needs another press through `gitSnapshot({ push: true })`.
 */
export async function gitSetRemote(
  vaultPath: string,
  url: string,
): Promise<GitSetRemoteResult | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<GitSetRemoteResult>('git_set_remote', { vaultPath, url });
}

/** Rust `GitDocumentDiffResult`. */
export interface GitDocumentDiffResult {
  path: string;
  /** Unified diff with the whole document as context; empty when `tooLarge`. */
  diff: string;
  untracked: boolean;
  /** `true` when the document is too long to send whole; the caller falls back to its hunks. */
  tooLarge: boolean;
}

/**
 * One document with the whole of it around its changes — the working file against `HEAD`,
 * or, with `source`, what that commit did to it. Read-only.
 */
export async function gitDocumentDiff(
  vaultPath: string,
  relativePath: string,
  source?: string,
  /** The name the document had, when it was just renamed, so git can pair the two. */
  previousPath?: string | null,
): Promise<GitDocumentDiffResult | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<GitDocumentDiffResult>('git_document_diff', {
    vaultPath,
    relativePath,
    source: source ?? null,
    previousPath: previousPath ?? null,
  });
}

/** Rust `GitRestoreResult`. */
export interface GitRestoreResult {
  restored: boolean;
  /** Vault-relative path of the one document touched. */
  path: string;
  /** `HEAD` or the commit hash the content came from. */
  source: string;
  /** What the document was before: `added` | `modified` | `deleted` | `renamed`, or `null` when it was clean. */
  previousStatus: string | null;
}

/**
 * Called only from a confirm button. Rust touches one path inside the vault and refuses a
 * never-committed file or a source whose frontmatter identity differs; nothing is committed.
 */
export async function gitRestoreFile(
  vaultPath: string,
  relativePath: string,
  source: string,
): Promise<GitRestoreResult | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<GitRestoreResult>('git_restore_file', { vaultPath, relativePath, source });
}

/** Git status summary for the vault; `null` without the bridge (web degradation). */
export async function gitStatus(vaultPath: string): Promise<GitStatusResult | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<GitStatusResult>('git_status', { vaultPath });
}

/**
 * Commits the vault scope only, and only after an explicit click. With nothing to record, a push
 * still sends recorded steps. `setUpstream` is only for an explicit "send this branch" press;
 * never derive it from a missing upstream alone.
 */
export async function gitSnapshot(
  vaultPath: string,
  options: { message?: string | null; push?: boolean; setUpstream?: boolean } = {},
): Promise<GitSnapshotResult | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<GitSnapshotResult>('git_snapshot', {
    vaultPath,
    message: options.message ?? null,
    push: options.push ?? false,
    setUpstream: options.setUpstream ?? false,
  });
}

/** Recent commits that touched the vault path; `null` without the bridge. */
export async function gitHistory(
  vaultPath: string,
  limit = 10,
  /** Repository-relative document path (as `GitChangeEntry.path`) to scope the log to one document. */
  path?: string,
): Promise<GitCommitInfo[] | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<GitCommitInfo[]>('git_history', { vaultPath, limit, path: path ?? null });
}

export async function gitDiff(
  vaultPath: string,
  options?: { includePatch?: boolean },
): Promise<GitDiffResult | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<GitDiffResult>('git_diff', { vaultPath, includePatch: options?.includePatch ?? true });
}

/** The vault-scoped patch one commit wrote; `gitDiff` is the uncommitted working tree. */
export async function gitCommitDiff(
  vaultPath: string,
  hash: string,
): Promise<GitDiffResult | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<GitDiffResult>('git_commit_diff', { vaultPath, hash });
}

/** Pull from upstream — opt-in network use, **only after an explicit click**. */
export async function gitPull(vaultPath: string): Promise<GitPullResult | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<GitPullResult>('git_pull', { vaultPath });
}

/** The one network call that changes no local file; still only after an explicit click. */
export async function gitFetch(vaultPath: string): Promise<GitFetchResult | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<GitFetchResult>('git_fetch', { vaultPath });
}

/**
 * Rust answers `<code>: <git's own words>` (`src-tauri/src/errors.rs`): the sentence is chosen
 * here in the reader's locale, with git's stderr in parentheses. No lookup returns it untouched.
 */
export function gitErrorMessage(err: unknown, lookup?: NativeErrorLookup): string {
  return nativeErrorMessage(err, lookup);
}

/** When one repository path last changed, as `git_paths_last_change` reports it. */
export interface GitPathLastChange {
  /** The key exactly as passed — a `path:` value or a vault-relative document path. */
  path: string;
  exists: boolean;
  /** A folder changes whenever anything under it does: weaker evidence than a file. */
  isDir: boolean;
  /** ISO time of the newest commit touching the path in the walk window, else null. */
  lastChangedAt: string | null;
}

/**
 * Last change per path in one Git walk. `repoPaths` are repository-relative (`path:`
 * values); `vaultPaths` are vault-relative document paths the Rust side resolves through
 * the vault's own pathspec. `null` without the bridge.
 */
export async function gitPathsLastChange(
  vaultPath: string,
  repoPaths: readonly string[],
  vaultPaths: readonly string[],
): Promise<GitPathLastChange[] | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<GitPathLastChange[]>('git_paths_last_change', {
    vaultPath,
    repoPaths: [...repoPaths],
    vaultPaths: [...vaultPaths],
  });
}

/** The native binding selects source authority; the two roots never share path keys. */
export interface BoundEvidenceDates {
  status: 'measured' | 'partial' | 'ungranted' | 'binding-changed' | 'no-history' | 'unreadable' | 'ambiguous-source' | 'wrong-folder';
  vaultChanges: (GitPathLastChange & { dirty: boolean })[];
  sourceChanges: (GitPathLastChange & { dirty: boolean })[];
  omittedVaultPaths: string[];
  omittedSourcePaths: string[];
}

export async function gitBoundEvidenceDates(
  vaultPath: string, projectSlug: string, vaultPaths: readonly string[], sourcePaths: readonly string[], selectedSourcePath?: string,
): Promise<BoundEvidenceDates | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  const result = await invoke<BoundEvidenceDates>('git_bound_evidence_dates', {
    vaultPath, projectSlug, vaultPaths: [...vaultPaths], sourcePaths: [...sourcePaths], selectedSourcePath: selectedSourcePath ?? null,
  });
  const normalize = (row: BoundEvidenceDates['vaultChanges'][number]) => ({
    ...row,
    lastChangedAt: !row.exists || row.dirty || row.isDir || !row.lastChangedAt || !Number.isFinite(Date.parse(row.lastChangedAt)) ? null : row.lastChangedAt,
  });
  return { ...result, vaultChanges: result.vaultChanges.map(normalize), sourceChanges: result.sourceChanges.map(normalize) };
}
