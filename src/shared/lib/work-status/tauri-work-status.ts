import { invoke, isTauri } from '@tauri-apps/api/core';

/** Mirrors `src-tauri/src/work_status/`, which owns the contract. */
export type WorktreeStanding = 'base' | 'merged' | 'noCommits' | 'ahead' | 'unknown';
export type LockState = 'live' | 'stale' | 'unparsed';
export type LockTool = 'claudeCode' | 'unknown';
export type AgentTool = 'claudeCode' | 'codex';

/** An agent program whose own working folder, or a command's it runs, lies in the worktree. */
export interface WorktreeProcess {
  pid: number;
  tool: AgentTool;
  /** Seconds since the epoch. */
  startedAt: number | null;
}

export interface WorktreeLock {
  state: LockState;
  tool: LockTool;
  agentId: string | null;
  pid: number | null;
  /** Seconds since the epoch, from the lock reason. */
  sessionStartedAt: number | null;
  /** Milliseconds since the epoch: when the worktree was locked. */
  lockedAt: number | null;
}

export interface WorktreeRow {
  id: string;
  path: string;
  branch: string | null;
  head: string | null;
  mainCheckout: boolean;
  missing: boolean;
  standing: WorktreeStanding;
  ahead: number | null;
  /** Seconds since the epoch. */
  lastCommitAt: number | null;
  lastCommitAuthor: string | null;
  lock: WorktreeLock | null;
  acpPid: number | null;
  agentProcesses: WorktreeProcess[];
}

/** A commit beyond the base branch. The subject is untrusted text: render it as plain text only. */
export interface CommitLine {
  hash: string;
  /** Control and direction-override characters removed, at most 200 characters. */
  subject: string;
  /** Seconds since the epoch. */
  at: number | null;
}

/** An uncommitted file: its path relative to the worktree, in Git's `/` spelling, and when it was last written, in seconds. */
export interface ChangedFile {
  path: string;
  changedAt: number | null;
}

/** What one worktree is doing, read by `work_status_activity`. */
export interface WorktreeActivity {
  stamp: string;
  /** Newest first, at most twenty; `null` when the base branch is unknown or the log was unreadable. */
  commits: CommitLine[] | null;
  /** The worktree stands on the base branch: `commits` are that branch's own newest, not commits beyond it. */
  onBase: boolean;
  /** Changed tracked files and untracked entries; `null` when `git status` failed. */
  uncommitted: number | null;
  /** The uncommitted path that changed last, relative to the worktree, in Git's `/` spelling. */
  latestFile: string | null;
  /** The uncommitted files, last changed first, at most sixty. */
  files: ChangedFile[];
}

/** What a Claude Code session says of itself in its own session list. */
export type AgentSessionState = 'waitingApproval' | 'waitingAnswer' | 'working' | 'replied' | 'failed';

/** One Claude Code session standing in a worktree; never its id or folder. */
export interface AgentSessionRow {
  worktreeId: string;
  pid: number;
  state: AgentSessionState;
  /**
   * The name Claude Code gives the session: one line of at most 60 characters, control and
   * direction-override characters removed. Absent while names are switched off, or when the list
   * gives none. Plain text from the person's own tool: render it, never parse, link or pass it on.
   */
  name?: string | null;
}

/**
 * How the last read of the session list went. `pending`: sessions run and the first read has not
 * come due. `noSession`: no Claude Code runs, so nothing is read. `unsupported`: this system cannot run the program with no network, so it never runs.
 */
export type AgentSessionsReadStatus = 'pending' | 'read' | 'noSession' | 'notFound' | 'timedOut' | 'failed' | 'unknownForm' | 'unsupported';

export interface AgentSessionsRead {
  status: AgentSessionsReadStatus;
  rows: AgentSessionRow[];
}

export interface WorkStatusSnapshot {
  status: 'ready' | 'ungranted' | 'unreadable' | 'no-history' | 'git-missing';
  root: string;
  repository: string;
  host: string | null;
  baseBranch: string | null;
  worktrees: WorktreeRow[];
}

/** A change the base branch took in: a merged branch or a squashed commit. The subject is untrusted text. */
export interface LandedChange {
  hash: string;
  subject: string;
  /** Seconds since the epoch. */
  at: number | null;
  /** A merge commit, which brought a branch's own commits. */
  merge: boolean;
  /** Against the first parent; `null` when Git printed no stat. */
  files: number | null;
  insertions: number | null;
  deletions: number | null;
}

export interface LandedFile {
  path: string;
  /** `null` for a binary file. */
  insertions: number | null;
  deletions: number | null;
}

/** One landed change opened: the branch commits a merge brought, and the files it changed, most changed first. */
export interface LandedDetail {
  hash: string;
  commits: CommitLine[];
  commitCount: number;
  files: LandedFile[];
  fileCount: number;
}

export function isWorkStatusAvailable(): boolean {
  return typeof window !== 'undefined' && isTauri();
}

export async function readWorkStatus(repositoryPath: string): Promise<WorkStatusSnapshot | null> {
  return isWorkStatusAvailable() ? invoke<WorkStatusSnapshot>('work_status_read', { repositoryPath }) : null;
}

/** Changes when a worktree is added, removed, locked, unlocked or committed to; costs no process. */
export async function readWorkStatusFingerprint(repositoryPath: string): Promise<string | null> {
  return isWorkStatusAvailable() ? invoke<string | null>('work_status_fingerprint', { repositoryPath }) : null;
}

/** One stamp per worktree id from stats of its `HEAD`, `index` and reflog; costs no process. */
export async function readActivityStamps(repositoryPath: string): Promise<Record<string, string> | null> {
  return isWorkStatusAvailable() ? invoke<Record<string, string> | null>('work_status_activity_stamps', { repositoryPath }) : null;
}

/** One worktree's newest commit subjects and uncommitted files: two `git` processes, one read at a time. */
export async function readWorktreeActivity(repositoryPath: string, worktreeId: string, baseBranch: string | null): Promise<WorktreeActivity | null> {
  return isWorkStatusAvailable() ? invoke<WorktreeActivity | null>('work_status_activity', { repositoryPath, worktreeId, baseBranch }) : null;
}

/**
 * What each Claude Code session in the repository's worktrees says of itself, and how the last read
 * went. Rust paces the read (one `claude agents --json` in ten seconds, with no network) and
 * answers from its last list in between; `null` while a read runs, so the caller keeps what it had.
 */
export async function readAgentSessions(repositoryPath: string): Promise<AgentSessionsRead | null> {
  return isWorkStatusAvailable() ? invoke<AgentSessionsRead | null>('work_status_agent_sessions', { repositoryPath }) : null;
}

/**
 * Tells Rust whether the person leaves the read on. Off holds there too, so an ask already on its
 * way starts no program, and Rust drops the last list it held.
 */
export async function setAgentSessionsRead(on: boolean): Promise<void> {
  if (isWorkStatusAvailable()) await invoke('work_status_set_agent_sessions_read', { on });
}

/**
 * Tells Rust whether the person leaves session names on. Off holds there too: the next list read
 * keeps no name, and the names Rust held are dropped.
 */
export async function setSessionNamesRead(on: boolean): Promise<void> {
  if (isWorkStatusAvailable()) await invoke('work_status_set_session_names', { on });
}

/** Counted file changes in one 10-second step: `atMs` is the step's start, `count` at most 99. */
export interface PulseStep {
  atMs: number;
  count: number;
}

/**
 * One worktree's counted file changes, as Rust keeps them in memory: never a name or a path. A
 * counted change is outside `.git`, outside the fixed dependency and build folders, and not ignored
 * by Git.
 */
export interface WorktreePulse {
  /** macOS watches the folder; `false` when it could not, so only the Git read's times hold. */
  watched: boolean;
  /** Milliseconds since the epoch: the last counted change; `null` with none in the last hour. */
  lastChangeAtMs: number | null;
  /** The steps of the last hour that had a change, oldest first. */
  steps: PulseStep[];
}

/** Every watched worktree's pulse, by worktree id, answered from Rust's memory. */
export interface FilePulseRead {
  worktrees: Record<string, WorktreePulse>;
}

/**
 * The counted file changes of the worktrees drawn as rooms. Asking starts or narrows the one
 * watcher to those worktrees; Rust answers from memory, so every notice since the last ask arrives
 * in one answer. `null` where this system has no pulse.
 */
export async function readFilePulse(repositoryPath: string, worktreeIds: readonly string[]): Promise<FilePulseRead | null> {
  return isWorkStatusAvailable() ? invoke<FilePulseRead | null>('work_status_file_pulse', { repositoryPath, worktreeIds }) : null;
}

/** The screen is hidden or closed: the watcher ends, and the counts it had stay for the hour. */
export async function pauseFilePulse(): Promise<void> {
  if (isWorkStatusAvailable()) await invoke('work_status_pause_file_pulse');
}

/** Tells Rust whether the person leaves the pulse on. Off ends the watcher and drops every count. */
export async function setFilePulseRead(on: boolean): Promise<void> {
  if (isWorkStatusAvailable()) await invoke('work_status_set_file_pulse', { on });
}

/** The tool groups load is said in, by program name; a program outside the closed list is `other`. */
export type LoadTool = 'agent' | 'node' | 'rust' | 'java' | 'gradleDaemon' | 'xcode' | 'python' | 'git' | 'other';

/** The processes of one tool group: how many, their memory and their CPU. */
export interface LoadGroup {
  tool: LoadTool;
  count: number;
  memoryBytes: number;
  /** Cores busy over the sample: 1.0 is one core for the whole sample; `null` on the first sample. */
  cpuCores: number | null;
}

/** An agent program whose commands run in this worktree, while the program itself counts for another. */
export interface AgentElsewhere {
  /** The agent program's pid, one the snapshot already holds. */
  pid: number;
  worktreeId: string;
}

/** What one worktree's processes hold: each counts once, for the worktree its folder, or its nearest ancestor's, lies in. */
export interface WorktreeLoad {
  memoryBytes: number;
  cpuCores: number | null;
  /** Every group with a process here; the page shows the five largest. */
  groups: LoadGroup[];
  agentsElsewhere: AgentElsewhere[];
}

/** macOS's own memory pressure level. */
export type MemoryPressure = 'normal' | 'warning' | 'critical';

export interface MacLoad {
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  pressure: MemoryPressure;
  cpuCores: number | null;
  coreCount: number;
  /** The busiest accelerator's "Device Utilization %"; `null` when the Mac reports none. */
  gpuPercent: number | null;
}

/** One load sample. `failed`: a read of this sample failed, and no number in it stands. */
export interface LoadRead {
  status: 'read' | 'failed';
  worktrees: Record<string, WorktreeLoad>;
  /** Groups whose processes lie in no worktree, such as a Gradle daemon. */
  outside: LoadGroup[];
  mac: MacLoad | null;
}

/** One load sample: one process listing, one usage read per process under an agent, three reads for the Mac. `null` where this system has no load. */
export async function readLoad(repositoryPath: string): Promise<LoadRead | null> {
  return isWorkStatusAvailable() ? invoke<LoadRead | null>('work_status_load', { repositoryPath }) : null;
}

/**
 * Tells Rust whether load is read now: switched on and the screen visible. Off drops the previous
 * sample, so the first sample after it carries no CPU figure.
 */
export async function setLoadRead(on: boolean): Promise<void> {
  if (isWorkStatusAvailable()) await invoke('work_status_set_load', { on });
}

/** The newest thirty changes on the base branch's first-parent line, with their stats: one `git log`. */
/** The newest landed changes, and how many landed in the last seven days (often more than were read). */
export interface LandedRead {
  changes: LandedChange[];
  weekCount: number | null;
}

export async function readLandedChanges(repositoryPath: string, baseBranch: string): Promise<LandedRead | null> {
  return isWorkStatusAvailable() ? invoke<LandedRead | null>('work_status_landed', { repositoryPath, baseBranch }) : null;
}

/** One landed change's branch commits and files: two `git` reads. */
export async function readLandedDetail(repositoryPath: string, hash: string): Promise<LandedDetail | null> {
  return isWorkStatusAvailable() ? invoke<LandedDetail | null>('work_status_landed_detail', { repositoryPath, hash }) : null;
}
