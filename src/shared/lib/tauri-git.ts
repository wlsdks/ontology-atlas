import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';

/**
 * Atlas Git — Tauri IPC 브리지 (`src-tauri/src/git.rs` 의 5 command 타입드 래퍼).
 *
 * 계약 (Rust 코드가 진실원):
 * - `git_status(vault_path)`   → `GitStatusResult`   — repo 밖이면 initialized:false (에러 아님)
 * - `git_snapshot(vault_path, message?, push?)` → `GitSnapshotResult` — 변경 0 이면 committed:false/reason:"no-changes"
 * - `git_history(vault_path, limit?)` → `GitCommitInfo[]` — 커밋 0개면 빈 배열
 * - `git_diff(vault_path)`     → `GitDiffResult`
 * - `git_pull(vault_path)`     → `GitPullResult`
 *
 * 신뢰 헌장 (git.rs 상단 불변식 — UI 도 지켜야 한다):
 * 1. 기본 로컬 커밋만 — push/pull 은 명시 opt-in 호출로만.
 * 2. git 미초기화 시 자동 `git init` 금지 — status 로만 알린다.
 * 3. 자동 실행/자동 백업 강제 금지 — 모든 호출은 사용자의 명시 클릭 뒤에만.
 *
 * 웹(브라우저 vault) 강등 계약: Tauri 런타임이 아니면 `isGitBridgeAvailable()`
 * 이 false, 모든 래퍼는 invoke 없이 `null` 을 돌려준다 — 호출부가 정직하게
 * 세션 changeset 요약 + CLI 명령 안내로 강등한다.
 *
 * 예상 실패(레포 아님·훅 거부·충돌 등)는 Rust 가 `Result<_, String>` 의 Err
 * 로 돌려주므로 invoke 는 **string** 으로 reject 한다 — `gitErrorMessage` 로
 * 사용자 한 줄을 뽑는다.
 */

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function getInvoke(): TauriInvoke | null {
  if (typeof window === 'undefined') return null;
  if (!isTauri()) return null;
  return (command, args) => tauriInvoke(command, args);
}

export type GitChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed';

/** Rust `ChangeEntry` (serde camelCase). */
export interface GitChangeEntry {
  path: string;
  status: GitChangeStatus;
  kind: string | null;
  slug: string;
  renamedFrom: string | null;
}

/** Rust `SnapshotCounts`. */
export interface GitSnapshotCounts {
  added: number;
  modified: number;
  deleted: number;
  renamed: number;
  total: number;
}

/** Rust `GitStatusResult`. */
export interface GitStatusResult {
  /** vault 가 git repo 안인가 — 버튼 활성화 판단의 1차 신호. */
  initialized: boolean;
  repoRoot: string | null;
  branch: string | null;
  /** upstream ref (예: origin/main) — null 이면 push 불가 안내. */
  upstream: string | null;
  /** vault 범위의 미커밋 변경 수 — dirty 점의 진실원. */
  changedCount: number;
  /** vault 밖에 이미 staged 된 경로 (스냅샷이 건드리지 않음 — 정보용). */
  stagedOutsideVault: string[];
}

/** Rust `PushOutcome` — push 실패는 크래시가 아니라 안내(커밋은 이미 로컬). */
export interface GitPushOutcome {
  pushed: boolean;
  remoteUrl: string | null;
  message: string | null;
  guidance: string | null;
}

/** Rust `GitSnapshotResult`. */
export interface GitSnapshotResult {
  committed: boolean;
  /** "no-changes" | null(커밋됨). */
  reason: string | null;
  commitHash: string | null;
  subject: string | null;
  summary: string | null;
  counts: GitSnapshotCounts;
  files: GitChangeEntry[];
  stagedOutsideVault: string[];
  /** push opt-in 시에만 채워짐. */
  push: GitPushOutcome | null;
}

/** Rust `GitCommitInfo`. */
export interface GitCommitInfo {
  shortHash: string;
  hash: string;
  subject: string;
  relativeTime: string;
  isoTime: string;
}

/** Rust `GitDiffResult`. */
export interface GitDiffResult {
  count: number;
  files: GitChangeEntry[];
  /** 추적 파일의 텍스트 diff — untracked 신규 파일은 files 목록으로만. */
  diff: string;
}

/** Rust `GitPullResult`. */
export interface GitPullResult {
  ok: boolean;
  upstream: string;
  summary: string;
}

/** Tauri git IPC 가용 여부 — false 면 웹 강등 경로. */
export function isGitBridgeAvailable(): boolean {
  return getInvoke() !== null;
}

/** vault 의 git 상태 요약. 브리지 없으면 null (웹 강등). */
export async function gitStatus(vaultPath: string): Promise<GitStatusResult | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<GitStatusResult>('git_status', { vaultPath });
}

/**
 * vault 범위만 add + commit 하는 의미 단위 스냅샷 — **사용자의 명시 클릭
 * 뒤에만 호출할 것** (자동 실행 금지). `push` 는 opt-in(기본 false).
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

/** vault 경로에 닿은 최근 커밋 요약. 브리지 없으면 null. */
export async function gitHistory(
  vaultPath: string,
  limit = 10,
): Promise<GitCommitInfo[] | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<GitCommitInfo[]>('git_history', { vaultPath, limit });
}

/** 아직 커밋 안 된 vault 범위 변경의 파일 목록 + 텍스트 diff. */
export async function gitDiff(vaultPath: string): Promise<GitDiffResult | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<GitDiffResult>('git_diff', { vaultPath });
}

/** upstream 에서 pull — opt-in 전송, **명시 클릭 뒤에만**. */
export async function gitPull(vaultPath: string): Promise<GitPullResult | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<GitPullResult>('git_pull', { vaultPath });
}

/**
 * invoke reject 페이로드 → 사용자 한 줄. Rust 는 `Err(String)` 이라 보통
 * string 그대로 오지만, 브리지/직렬화 오류 대비 Error/unknown 도 수용.
 */
export function gitErrorMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  return String(err);
}
