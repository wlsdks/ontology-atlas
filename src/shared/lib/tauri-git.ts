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
 * - `git_fetch(vault_path)`    → `GitFetchResult` — 받아만 온다(작업 트리 불변)
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
  /**
   * upstream 과의 갈라짐 — `[ahead, behind]`. upstream 이 없으면 둘 다 `null`.
   *
   * **마지막 fetch 시점 기준**이다. 갱신하려면 `gitFetch()` 를 불러야 한다 —
   * git 이 원래 그렇고, 그래서 화면에 Fetch 가 따로 있다.
   */
  ahead: number | null;
  behind: number | null;
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
  /**
   * 이 걸음이 건드린 vault 파일 — `kind`/`slug` 가 실려 있다.
   *
   * 이게 없던 동안 이력은 **커밋 제목 문자열**일 뿐이라, 화면이 「이 걸음이
   * 어떤 개념을 바꿨나」를 물어볼 방법이 아예 없었다. `kind` 는 지금 디스크의
   * 파일에서 읽으므로 지워진 파일에서는 `null` 이다.
   */
  files: GitChangeEntry[];
}

/** Rust `GitFetchResult` — 받아만 오고 작업 트리는 안 건드린다. */
export interface GitFetchResult {
  ok: boolean;
  /** upstream ref. 없으면 빈 문자열 + `ok:false`. */
  upstream: string;
  /** fetch **직후** 다시 잰 갈라짐. */
  ahead: number | null;
  behind: number | null;
  summary: string;
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

/** Rust `GitInitResult`. */
export interface GitInitResult {
  /** 이번 호출로 기록이 시작됐나. 이미 저장소였으면 false. */
  initialized: boolean;
  /** `'already'`(이미 저장소) | null(방금 시작). */
  reason: string | null;
  repoRoot: string;
  branch: string | null;
  /** 시작 직후 "아직 남기지 않은 변경" 수. */
  changedCount: number;
}

/** Rust `GitSetRemoteResult`. */
export interface GitSetRemoteResult {
  ok: boolean;
  /** 항상 `'origin'`. */
  remote: string;
  url: string;
  /** 기존 주소를 교체했으면 이전 주소. */
  replaced: string | null;
}

/** Rust `GitProbe` — 이 컴퓨터에 git 이 있는가. */
export interface GitProbeResult {
  installed: boolean;
  /** `git --version` 원문 — 사용자에게 사실을 그대로 보여준다. */
  version: string | null;
  platform: 'macos' | 'windows' | 'linux';
}

/**
 * git 설치 여부 확인 — **읽기 전용**. 아무것도 설치하지 않는다.
 *
 * 왜 필요한가: 지금까지 미설치는 일반 에러 문자열로만 드러나서 화면이 "설치가
 * 문제인지 폴더가 문제인지" 구분할 수 없었다. 타입화된 신호가 있어야 플랫폼에
 * 맞는 설치 안내를 고를 수 있다.
 */
export async function gitProbe(): Promise<GitProbeResult | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<GitProbeResult>('git_probe');
}

/** Tauri git IPC 가용 여부 — false 면 웹 강등 경로. */
export function isGitBridgeAvailable(): boolean {
  return getInvoke() !== null;
}

/**
 * 이 폴더의 기록 시작(`git init`) — **사용자가 화면에서 직접 누를 때만**.
 *
 * 자동 호출 금지. 헌장이 금지하는 것은 *자동* 실행이고 사용자 클릭은 그 범주가
 * 아니지만(2026-07-25 소유자 결정), 그 경계는 호출부가 지켜야 한다. Rust 쪽은
 * init 만 하고 add/commit/push 로 연쇄하지 않는다 — 시작 직후 상태는 "아직
 * 남기지 않은 변경 N건" 이다.
 */
export async function gitInit(vaultPath: string): Promise<GitInitResult | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<GitInitResult>('git_init', { vaultPath });
}

/**
 * 보낼 곳(`origin`) 설정 — **사용자가 입력한 주소만** 넘긴다. 주소를 제안·추측·
 * 자동탐지하지 말 것. 이 호출은 주소만 등록하고 **보내지 않는다** — 전송은
 * `gitSnapshot({ push: true })` 로 사용자가 따로 눌러야 한다.
 */
export async function gitSetRemote(
  vaultPath: string,
  url: string,
): Promise<GitSetRemoteResult | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<GitSetRemoteResult>('git_set_remote', { vaultPath, url });
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

/**
 * 한 커밋이 실제로 쓴 것 — 그 걸음의 vault 범위 patch.
 *
 * `gitDiff` 와 별도인 이유는 Rust 쪽 주석과 같다: 저쪽은 아직 이름이 안 붙은
 * 작업 트리, 이쪽은 이미 이름이 붙은 한 걸음이다.
 */
export async function gitCommitDiff(
  vaultPath: string,
  hash: string,
): Promise<GitDiffResult | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<GitDiffResult>('git_commit_diff', { vaultPath, hash });
}

/** upstream 에서 pull — opt-in 전송, **명시 클릭 뒤에만**. */
export async function gitPull(vaultPath: string): Promise<GitPullResult | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<GitPullResult>('git_pull', { vaultPath });
}

/**
 * 원격의 최신 상태를 **받아만 온다** — 작업 트리는 안 건드린다.
 *
 * 네트워크를 타는 셋(`gitSnapshot(push)` · `gitPull` · 이것) 중 유일하게
 * 로컬 파일을 하나도 바꾸지 않는 것이라, 「지금 원격이 어떤지 알고 싶다」에
 * 대한 가장 싼 답이다. 그래도 **명시 클릭 뒤에만** 돈다 — 자동 호출 금지.
 */
export async function gitFetch(vaultPath: string): Promise<GitFetchResult | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<GitFetchResult>('git_fetch', { vaultPath });
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
