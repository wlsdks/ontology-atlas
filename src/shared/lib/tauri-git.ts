import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';

/**
 * Atlas Git — the Tauri IPC bridge: typed wrappers over the commands in
 * `src-tauri/src/git.rs`, which is the source of truth for the contract.
 *
 * - `git_status(vault_path)` → `GitStatusResult` — outside a repo it returns
 *   `initialized: false`, not an error
 * - `git_snapshot(vault_path, message?, push?)` → `GitSnapshotResult` — with no
 *   changes, `committed: false` / `reason: "no-changes"`
 * - `git_history(vault_path, limit?)` → `GitCommitInfo[]` — empty array when
 *   there are no commits
 * - `git_diff(vault_path)` → `GitDiffResult`
 * - `git_pull(vault_path)` → `GitPullResult`
 * - `git_fetch(vault_path)` → `GitFetchResult` — fetch only, working tree untouched
 *
 * **Trust-charter invariants** (stated at the top of `git.rs`; the UI must hold
 * them too):
 * 1. Local commits only by default — push/pull happen only through an explicit
 *    opt-in call.
 * 2. Never run `git init` automatically when git is uninitialised — report it
 *    through status instead.
 * 3. No automatic runs and no forced auto-backup — every call must follow an
 *    explicit user click.
 *
 * Web degradation contract: outside the Tauri runtime `isGitBridgeAvailable()`
 * is false and every wrapper returns `null` without invoking, so callers degrade
 * honestly to a session changeset summary plus the equivalent CLI command.
 *
 * Expected failures (not a repo, a hook refusing, a conflict) come back as the
 * `Err` arm of Rust's `Result<_, String>`, so invoke rejects with a **string** —
 * `gitErrorMessage` turns it into one user-facing line.
 */

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function getInvoke(): TauriInvoke | null {
  if (typeof window === 'undefined') return null;
  if (!isTauri()) return null;
  return (command, args) => tauriInvoke(command, args);
}

type GitChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed';

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
  /** Is the vault inside a git repo — the first signal for enabling buttons. */
  initialized: boolean;
  repoRoot: string | null;
  branch: string | null;
  /** Upstream ref (e.g. origin/main); `null` means push is unavailable. */
  upstream: string | null;
  /** Uncommitted changes within the vault — the source of truth for the dirty dot. */
  changedCount: number;
  /**
   * Divergence from upstream, `[ahead, behind]`; both `null` with no upstream.
   *
   * **Measured as of the last fetch.** Refreshing it requires calling
   * `gitFetch()` — that is how git works, which is why Fetch is its own control
   * on screen.
   */
  ahead: number | null;
  behind: number | null;
  /** Already-staged paths outside the vault; the snapshot leaves them alone (informational). */
  stagedOutsideVault: string[];
}

/** Rust `PushOutcome` — a failed push is guidance, not a crash: the commit is already local. */
interface GitPushOutcome {
  pushed: boolean;
  remoteUrl: string | null;
  message: string | null;
  guidance: string | null;
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
  /**
   * The vault files this step touched, carrying `kind` and `slug`.
   *
   * Without this, history was nothing but **commit subject strings**, so the UI
   * had no way at all to ask which concept a step changed. `kind` is read from
   * the file on disk right now, so it is `null` for deleted files.
   */
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
}

/** Rust `GitPullResult`. */
export interface GitPullResult {
  ok: boolean;
  upstream: string;
  summary: string;
}

/** Rust `GitInitResult`. */
export interface GitInitResult {
  /** Did this call start tracking? False if it was already a repo. */
  initialized: boolean;
  /** `'already'` when it was already a repo, `null` when it was just started. */
  reason: string | null;
  repoRoot: string;
  branch: string | null;
  /** Count of not-yet-recorded changes right after starting. */
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
 * Check whether git is installed — **read-only**, installs nothing.
 *
 * Why it exists: a missing git used to surface only as a generic error string,
 * so the UI could not tell "git is missing" from "the folder is wrong". A typed
 * signal is what lets it pick the right platform-specific install guidance.
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
 * Start tracking this folder (`git init`) — **only when the user presses it**.
 *
 * Never call automatically. What the charter forbids is *automatic* execution,
 * and a user click is not in that category (owner decision, 2026-07-25) — but
 * that boundary is the caller's to hold. The Rust side only inits; it never
 * chains into add/commit/push, so the state right after starting is "N changes
 * not yet recorded".
 */
export async function gitInit(vaultPath: string): Promise<GitInitResult | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<GitInitResult>('git_init', { vaultPath });
}

/**
 * Set the destination (`origin`) — pass **only a URL the user typed**. Never
 * suggest, guess, or auto-detect one. This call registers the URL and **sends
 * nothing**; transmitting requires the user to press again through
 * `gitSnapshot({ push: true })`.
 */
export async function gitSetRemote(
  vaultPath: string,
  url: string,
): Promise<GitSetRemoteResult | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<GitSetRemoteResult>('git_set_remote', { vaultPath, url });
}

/** Git status summary for the vault; `null` without the bridge (web degradation). */
export async function gitStatus(vaultPath: string): Promise<GitStatusResult | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<GitStatusResult>('git_status', { vaultPath });
}

/**
 * A meaningful snapshot that adds and commits the vault scope only — **call it
 * only after an explicit user click** (never automatically). `push` is opt-in
 * and defaults to false.
 */
export async function gitSnapshot(
  vaultPath: string,
  options: { message?: string | null; push?: boolean } = {},
): Promise<GitSnapshotResult | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<GitSnapshotResult>('git_snapshot', {
    vaultPath,
    message: options.message ?? null,
    push: options.push ?? false,
  });
}

/** Recent commits that touched the vault path; `null` without the bridge. */
export async function gitHistory(
  vaultPath: string,
  limit = 10,
): Promise<GitCommitInfo[] | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<GitCommitInfo[]>('git_history', { vaultPath, limit });
}

/** File list plus text diff for uncommitted changes within the vault. */
export async function gitDiff(vaultPath: string): Promise<GitDiffResult | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<GitDiffResult>('git_diff', { vaultPath });
}

/**
 * What one commit actually wrote — the vault-scoped patch for that step.
 *
 * Separate from `gitDiff` for the reason the Rust comment gives: that one is the
 * working tree, which has no name yet; this one is a step that already has one.
 */
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

/**
 * **Fetch only** — brings the remote's latest state without touching the working
 * tree.
 *
 * Of the three calls that use the network (`gitSnapshot(push)`, `gitPull`, this
 * one) it is the only one that changes no local file, which makes it the
 * cheapest answer to "what does the remote look like right now". It still runs
 * **only after an explicit click** — never call it automatically.
 */
export async function gitFetch(vaultPath: string): Promise<GitFetchResult | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<GitFetchResult>('git_fetch', { vaultPath });
}

/**
 * Turns an invoke rejection payload into one user-facing line. Rust returns
 * `Err(String)`, so it is usually a plain string, but Error/unknown are accepted
 * too in case the bridge or serialisation fails.
 */
export function gitErrorMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  return String(err);
}
