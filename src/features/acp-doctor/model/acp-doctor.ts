import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';

/**
 * 연동 점검 브리지 — `src-tauri/src/acp_doctor.rs` 의 두 command.
 *
 * 계약(Rust 가 진실원):
 * - `acp_diagnose(runtimeId)` → 검사 목록. **아무것도 고치지 않는다.**
 * - `acp_repair(runtimeId, checkId)` → 고친 뒤 **다시 잰** 검사 목록.
 *
 * 문구는 여기 없다. Rust 는 id 와 기계가 잰 사실만 돌려주고, 사람이 읽는 문장은
 * 화면이 i18n 으로 만든다 — Rust 에 한국어를 박으면 영어 화면이 거짓말을 한다.
 *
 * ## 웹에서는 없다
 *
 * 브라우저는 남의 프로세스를 띄우지도, 키체인을 보지도 못한다. 그래서 이 기능은
 * 앱에만 있고, 웹에서는 호출부가 아예 그리지 않는다 — 「곧 됩니다」가 아니라
 * 처음부터 없는 것이다(`.claude/rules/surfaces.md`).
 */

/** Rust `AcpCheck` 와 1:1. 필드가 늘면 계약 테스트가 먼저 터진다. */
export interface AcpCheck {
  /** i18n 키와 1:1인 검사 이름. */
  id: string;
  /** `ok` · `problem` · `unknown` — **모르는 것은 ok 가 아니다.** */
  state: 'ok' | 'problem' | 'unknown';
  /** 앱이 스스로 고칠 수 있나. `problem` 일 때만 뜻이 있다. */
  fixable: boolean;
  /**
   * 앞 단계가 막혀서 이 단계는 손대도 소용없다.
   *
   * 도구가 아예 없는 사람에게 「앱 몫 설정 고치기」를 권하던 것을 막는다
   * (2026-08-20 워크스루). 상태는 그대로 보여 주되 **행동은 권하지 않는다.**
   */
  blocked: boolean;
  /** 기계가 잰 사실 한 조각(경로 · 사유). 지어내지 않으므로 없을 수 있다. */
  detail?: string | null;
}

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function getInvoke(): TauriInvoke | null {
  try {
    return isTauri() ? (tauriInvoke as TauriInvoke) : null;
  } catch {
    return null;
  }
}

/** 앱에서만 점검이 가능하다. 호출부는 이것으로 그릴지 말지를 정한다. */
export function isAgentDoctorAvailable(): boolean {
  return getInvoke() !== null;
}

export async function diagnoseAgent(runtimeId: string): Promise<AcpCheck[]> {
  const invoke = getInvoke();
  if (!invoke) return [];
  return invoke<AcpCheck[]>('acp_diagnose', { runtimeId });
}

export async function repairAgentCheck(runtimeId: string, checkId: string): Promise<AcpCheck[]> {
  const invoke = getInvoke();
  if (!invoke) return [];
  return invoke<AcpCheck[]>('acp_repair', { runtimeId, checkId });
}

/**
 * 연결을 처음부터 다시 맺는다 — 앱이 만든 것만 지우고 다시 만든다.
 *
 * 「로그아웃」이 아닌 이유: 이 앱에는 앱 몫 로그인이 없다. 사용자가 터미널에서
 * 쓰는 그 로그인을 링크해서 그대로 쓰므로, 여기서 로그아웃을 내주면 남의 로그인을
 * 지우거나 아무것도 안 하면서 그런 척하게 된다. 자세한 근거는 Rust 쪽 독블록.
 */
export async function resetAgentConnection(runtimeId: string): Promise<AcpCheck[]> {
  const invoke = getInvoke();
  if (!invoke) return [];
  return invoke<AcpCheck[]>('acp_reset_connection', { runtimeId });
}

/**
 * 이 도구를 앱이 대신 깔아 줄 수 있나 — 그렇다면 **무슨 명령으로.**
 *
 * 화면은 이것을 받아 **누르기 전에 명령 원문을 보여 준다.** 그게 원장
 * 2026-08-20 (88) 의 조건 ②다: 무엇을 실행하는지 먼저 보여 준다.
 */
export async function agentInstallPlan(runtimeId: string): Promise<string | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<string | null>('acp_install_plan', { runtimeId });
}

/**
 * 앱 전용 자리에 그 도구를 깐다. 깐 뒤 **다시 잰 값**을 돌려준다.
 *
 * 전역 npm 도 시스템 PATH 도 안 건드린다(조건 ③). 버전은 고정돼 있다(조건 ④).
 */
export async function installAgentCli(runtimeId: string): Promise<AcpCheck[]> {
  const invoke = getInvoke();
  if (!invoke) return [];
  return invoke<AcpCheck[]>('acp_install_cli', { runtimeId });
}

/**
 * Node 를 앱이 받아 줄 수 있나 — 그렇다면 **어디서 무엇을.**
 *
 * 돌려주는 문자열에는 받을 주소와 해시 앞머리가 들어 있다. 화면은 누르기 전에
 * 그것을 보여 준다 — 「검증한다」가 말뿐이 아님을 화면이 스스로 댄다.
 */
export async function nodeInstallPlan(): Promise<string | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<string | null>('acp_node_plan');
}

/** Node 를 앱 전용 자리에 받아 두고 해시를 대조한다. 뒤에 다시 잰 값을 돌려준다. */
export async function installManagedNode(runtimeId: string): Promise<AcpCheck[]> {
  const invoke = getInvoke();
  if (!invoke) return [];
  return invoke<AcpCheck[]>('acp_install_node', { runtimeId });
}


/**
 * 설치가 어디까지 왔는지 — Rust `AcpInstallProgress` 와 1:1.
 *
 * ## 왜 이벤트인가 (2026-08-20 소유자 지적)
 *
 * *"버튼들만 누르면 알아서 설치되는 과정도 보여주고 완료된것도 체크해주고
 * 하나?"* — 아니었다. `acp_install_cli` / `acp_install_node` 는 **끝나야**
 * 돌아오므로, 52MB 를 받고 npm 이 도는 동안 화면이 할 수 있는 일은 칩을
 * 비활성으로 두는 것뿐이었다. 이 저장소의 워크스루가 **「조용한 기다림」**
 * 이라고 이름 붙여 둔 패턴 그대로다.
 */
export interface AcpInstallProgress {
  runtimeId: string;
  /** `node` · `cli` — 어느 일인가. */
  job: 'node' | 'cli';
  /** 어느 단계인가. **문구는 여기 없다** — 화면이 i18n 으로 만든다. */
  stage:
    | 'downloading'
    | 'verifying'
    | 'extracting'
    | 'installing'
    | 'verifying-install'
    | 'done'
    | 'failed';
  /** 아는 만큼만. 모르면 `null` 이고 화면은 퍼센트를 안 그린다. */
  received: number | null;
  total: number | null;
  /** 그 도구가 실제로 뱉은 줄. 우리가 지어낸 문장이 아니다. */
  note: string | null;
  /** 이 상태가 생긴 시각(epoch ms). 낡은 것을 안 그리기 위한 값. */
  at: number;
}

/**
 * **들고 있던 상태를 언제까지 보여 주나.**
 *
 * 마지막 상태를 보관하는 것과 그것을 계속 보여 주는 것은 다른 질문이다.
 * 이 창이 없으면 어제 끝난 설치가 오늘 설정을 열 때 「설치했어요」로 뜬다 —
 * 방금 한 일이 아닌 것을 방금 한 것처럼 말하는 셈이다.
 *
 * 5분인 이유: 시트를 닫고 딴 일 하다 돌아오는 시간은 덮되(그게 이 값이 존재하는
 * 이유다), 다음 세션까지 넘어가지는 않는 길이다.
 */
export const INSTALL_PROGRESS_FRESH_MS = 5 * 60 * 1000;

/** 지금 그려도 되는 상태인가. `now` 를 받는 이유는 시험이 시계를 고정하려고. */
export function isInstallProgressFresh(
  progress: Pick<AcpInstallProgress, 'at'>,
  now: number = Date.now(),
): boolean {
  // 시계가 뒤로 간 경우(시간대 변경·수동 조정)를 낡음으로 오해하지 않는다.
  const elapsed = now - progress.at;
  return elapsed < 0 || elapsed <= INSTALL_PROGRESS_FRESH_MS;
}

/**
 * 설치 진행을 듣는다. 떼는 함수를 돌려준다.
 *
 * 웹에서는 붙지 않는다 — 애초에 설치 버튼이 없다.
 */
/**
 * @param runtimeId 이 도구의 진행만 받는다. `null` 이면 **전부** 받는다 —
 *   레일 배지처럼 「어느 도구든 끝났나」를 보는 소비처가 쓴다.
 */
export async function listenInstallProgress(
  runtimeId: string | null,
  onProgress: (progress: AcpInstallProgress) => void,
): Promise<() => void> {
  if (!isAgentDoctorAvailable()) return () => undefined;
  try {
    const { listen } = await import('@tauri-apps/api/event');
    const unlisten = await listen<AcpInstallProgress>('acp-install://progress', (event) => {
      // 한 화면에 여러 도구 줄이 있다. 남의 진행을 내 줄에 그리지 않는다.
      if (!event.payload) return;
      if (runtimeId === null || event.payload.runtimeId === runtimeId) onProgress(event.payload);
    });
    return unlisten;
  } catch {
    // 못 들으면 진행률이 없을 뿐, 설치 자체는 그대로 돈다.
    return () => undefined;
  }
}

/**
 * 바이트를 사람이 읽는 크기로. 소수 한 자리까지 — 52MB 를 받는 동안 숫자가
 * 실제로 움직이는 것이 보여야 한다.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${Math.round(bytes)}B`;
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${mb.toFixed(1)}MB`;
}

/**
 * 이 도구의 **마지막 진행 상태**를 Rust 에 물어본다. 없으면 `null`.
 *
 * ## 왜 필요한가 (2026-08-20)
 *
 * 설정 시트는 닫히면 **통째로 언마운트된다** — 그래서 이 훅의 상태가 사라지고
 * 이벤트 구독도 끊긴다. Node 내려받기는 250ms 주기라 다시 열면 곧 되살아나지만,
 * **완료(`done`)는 단발 이벤트**라 닫아 둔 사이에 지나가면 **영영 못 본다.**
 *
 * 이벤트만으로는 「끝났다」를 못 지킨다. 그래서 마운트할 때 한 번 물어본다.
 */
export async function lastInstallProgress(
  runtimeId: string,
): Promise<AcpInstallProgress | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  try {
    const last =
      (await invoke<AcpInstallProgress | null>('acp_install_progress', { runtimeId })) ?? null;
    // 낡은 것은 아예 안 돌려준다 — 화면마다 판정을 다시 하게 두면 어긋난다.
    return last && isInstallProgressFresh(last) ? last : null;
  } catch {
    // 못 물어봤다고 화면을 세우지 않는다 — 고치기 전과 같은 상태가 될 뿐이다.
    return null;
  }
}

/** 더는 바뀌지 않는 단계 — 「끝났다」와 「실패했다」. */
export const TERMINAL_INSTALL_STAGES = ['done', 'failed'] as const;

export function isTerminalInstallStage(stage: AcpInstallProgress['stage']): boolean {
  return (TERMINAL_INSTALL_STAGES as readonly string[]).includes(stage);
}
