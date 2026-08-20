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
