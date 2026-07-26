import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';

/**
 * 볼트 에이전트의 대화 왕복 — Tauri IPC 브리지 (`src-tauri/src/llm.rs` 의
 * `llm_chat` 타입드 래퍼). `tauri-secrets.ts` 의 관례를 그대로 따른다.
 *
 * 계약 (Rust 코드가 진실원):
 * - `llm_chat(provider, vaultPath, model, question, body, scope)` → `LlmChatEcho`
 *
 * **키는 이 파일을 지나가지 않는다.** WebView 는 요청 본문만 조립하고, 인증
 * 헤더는 Rust 가 키체인에서 읽어 붙인다. 응답 본문은 정규화가 필요해서
 * 돌아오지만 감사 로그에는 길이만 남는다(대화 저장소가 아니다).
 *
 * 웹 강등 계약: Tauri 런타임이 아니면 `isLlmChatBridgeAvailable()` 이 false 이고
 * `llmChat` 은 invoke 없이 `null` 을 돌려준다 — 호출부는 입력칸을 아예 렌더하지
 * 않고 "왜 데스크톱 전용인가" 를 정직하게 설명한다. 웹 빌드에 전송 경로가
 * 없다는 것이 신뢰 헌장의 정직 강등이다.
 */

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function getInvoke(): TauriInvoke | null {
  if (typeof window === 'undefined') return null;
  if (!isTauri()) return null;
  return (command, args) => tauriInvoke(command, args);
}

/** 이 왕복에 실린 도구 호출 — 이름과 대상만 기록된다. */
export interface LlmToolRef {
  name: string;
  target: string;
}

/**
 * 전송 범위 — **실측값만** 넣는다. 추정치를 넣으면 화면 푸터와 감사 줄이
 * 동시에 거짓말을 한다.
 */
export interface LlmChatScope {
  /** 이 왕복까지 발췌를 보낸 볼트 노드 slug 들. */
  nodes: string[];
  /** 시스템 프롬프트 + 대화 전체 글자수. */
  promptChars: number;
  /** 그중 볼트 발췌가 차지하는 글자수. */
  vaultChars: number;
  tools: LlmToolRef[];
}

/** Rust `LlmChatEcho` (serde camelCase). */
export interface LlmChatEcho {
  status: number;
  /** 벤더 응답 본문 원문 — 정규화는 어댑터가 한다. */
  body: string;
  /** 이 왕복이 실제로 간 곳. */
  host: string;
  durationMs: number;
  /** 이 왕복이 남긴 감사 줄의 시각. */
  loggedAt: string;
}

/** Tauri 대화 IPC 가용 여부 — false 면 웹 강등 경로. */
export function isLlmChatBridgeAvailable(): boolean {
  return getInvoke() !== null;
}

/**
 * 대화 왕복 1회 — **사용자가 [보내기]를 누른 턴 안에서만**. 볼트 경로가 필수인
 * 이유는 감사 로그가 볼트 안에 살기 때문이다: 기록할 곳이 없으면 Rust 가
 * 보내지 않는다(log-before-send).
 */
export async function llmChat(args: {
  provider: string;
  vaultPath: string;
  model: string;
  /** 이 턴을 연 사용자 본인의 말. 왕복마다 같은 값을 싣는다. */
  question: string | null;
  /** 벤더 형식 그대로의 JSON 본문. */
  body: string;
  scope: LlmChatScope;
}): Promise<LlmChatEcho | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<LlmChatEcho>('llm_chat', {
    provider: args.provider,
    vaultPath: args.vaultPath,
    model: args.model,
    question: args.question,
    body: args.body,
    scope: args.scope,
  });
}

/** invoke reject 페이로드 → 사용자 한 줄 (Rust 는 `Err(String)`). */
export function llmChatErrorMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  return String(err);
}
