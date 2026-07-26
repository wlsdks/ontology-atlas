import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';

/**
 * BYOK 키 보관 — Tauri IPC 브리지 (`src-tauri/src/secrets.rs` · `llm.rs` 의
 * 타입드 래퍼). `tauri-git.ts` 의 관례를 그대로 따른다.
 *
 * 계약 (Rust 코드가 진실원):
 * - `secret_set(provider, secret)`     → `SecretStatus`
 * - `secret_status(provider)`          → `SecretStatus` — 없음도 정상 상태
 * - `secret_clear(provider)`           → `SecretStatus` — 멱등
 * - `secret_verify(provider, vaultPath)` → `LlmVerifyResult`
 *
 * **전체 키를 돌려주는 커맨드는 없다.** 화면이 아는 것은 `stored` 와 `last4`
 * 뿐이고, 그 계약은 `secrets.rs` 의 소스-리플렉션 테스트가 강제한다. 그래서 이
 * 파일에도 키를 담는 타입이 없다 — 키는 `secretSet` 의 인자로 한 번 흘러갈
 * 뿐이고, 호출부는 성공 직후 자기 상태에서 즉시 지운다.
 *
 * 웹 강등 계약: Tauri 런타임이 아니면 `isSecretBridgeAvailable()` 이 false,
 * 모든 래퍼는 invoke 없이 `null` 을 돌려준다 — 호출부가 입력 필드를 아예
 * 렌더하지 않고 "왜 데스크톱 전용인가" 를 정직하게 설명한다.
 */

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function getInvoke(): TauriInvoke | null {
  if (typeof window === 'undefined') return null;
  if (!isTauri()) return null;
  return (command, args) => tauriInvoke(command, args);
}

/**
 * Rust `PROVIDERS` 허용목록과 같은 순서 — 화면 표시 순서이기도 하다.
 *
 * 명명 벤더는 **3에서 동결**한다(근거는 `secrets.rs` 의 같은 상수 주석). 넷째
 * 벤더를 여기 더하기 전에 그 조건부터 읽어라 — 나머지 벤더는 명명 팔이 아니라
 * 사용자가 주소를 직접 적는 갈래로 간다.
 */
export const SECRET_PROVIDERS = ['anthropic', 'openai', 'gemini'] as const;
export type SecretProvider = (typeof SECRET_PROVIDERS)[number];

/**
 * 각 키가 실제로 향하는 호스트. 화면이 **붙여넣기 전에** "이 키가 가는 곳" 을
 * 말하는 근거이고, 같은 호스트가 감사 줄의 `host` 로 남는다.
 *
 * 진실원은 Rust 쪽 확인 URL 이다(`src-tauri/src/llm.rs`). 여기 값이 그것과
 * 갈라지면 화면이 약속한 목적지와 실제 목적지가 달라지므로, 공유 픽스처
 * `tests/fixtures/llm-provider-hosts.json` 를 양쪽 테스트가 함께 본다.
 */
export const SECRET_PROVIDER_HOSTS: Record<SecretProvider, string> = {
  anthropic: 'api.anthropic.com',
  openai: 'api.openai.com',
  gemini: 'generativelanguage.googleapis.com',
};

/** Rust `SecretStatus` (serde camelCase). */
export interface SecretStatus {
  provider: string;
  /** 키가 이 컴퓨터의 키체인에 있는가. */
  stored: boolean;
  /** 마지막 4자 — 있을 때만. 전체 키는 어떤 경로로도 오지 않는다. */
  last4: string | null;
}

/** Rust `LlmVerifyResult`. */
export interface LlmVerifyResult {
  provider: string;
  ok: boolean;
  /**
   * 키 자체가 거부됐나. **상태 코드로 화면이 다시 판정하지 않는다** — 거부를
   * 뜻하는 코드가 벤더마다 다르기 때문이다(Gemini 는 401 이 아니라 400 을
   * 준다). 판정은 Rust 한 곳에서 하고, 같은 결론이 감사 줄에도 남는다.
   */
  denied: boolean;
  httpStatus: number | null;
  /** 네트워크 실패 등의 한 줄. 키는 담기지 않는다. */
  message: string | null;
  durationMs: number;
  /** 이 호출이 남긴 감사 줄의 시각. */
  loggedAt: string;
}

/** Tauri 보관 IPC 가용 여부 — false 면 웹 강등 경로. */
export function isSecretBridgeAvailable(): boolean {
  return getInvoke() !== null;
}

/** 저장 — **사용자가 붙여넣고 저장을 누를 때만**. 성공 후 호출부는 입력값을 버린다. */
export async function secretSet(
  provider: SecretProvider,
  secret: string,
): Promise<SecretStatus | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<SecretStatus>('secret_set', { provider, secret });
}

/** 상태 조회 — "있는가 · 끝 4자". */
export async function secretStatus(
  provider: SecretProvider,
): Promise<SecretStatus | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<SecretStatus>('secret_status', { provider });
}

/** 삭제 — 없어도 성공(멱등). */
export async function secretClear(
  provider: SecretProvider,
): Promise<SecretStatus | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<SecretStatus>('secret_clear', { provider });
}

/**
 * 연결 확인 — 인증만 확인하는 최소 요청. **볼트 데이터는 0자** 나가고, 호출은
 * 볼트 안 `.ontology-atlas/llm-audit.jsonl` 에 남는다. 그래서 볼트 경로가
 * 필수다: 기록할 곳이 없으면 Rust 가 보내지 않는다(log-before-send).
 */
export async function secretVerify(
  provider: SecretProvider,
  vaultPath: string,
): Promise<LlmVerifyResult | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<LlmVerifyResult>('secret_verify', { provider, vaultPath });
}

/** invoke reject 페이로드 → 사용자 한 줄 (Rust 는 `Err(String)`). */
export function secretErrorMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  return String(err);
}
