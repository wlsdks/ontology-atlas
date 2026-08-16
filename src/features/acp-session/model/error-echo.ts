/**
 * 실패 하나를 화면이 **두 번** 말하는 것을 막는다.
 *
 * ## 실물에서 본 것 (2026-08-17, 설치된 앱)
 *
 * claude 로그인이 만료된 상태로 한 마디 보냈더니 대화 칸이 이렇게 됐다:
 *
 * ```
 * [나]  내 프로젝트 노드와 예시 영역 노드가 …
 *       Failed to authenticate: OAuth session expired and could not be refreshed
 *       ┌─────────────────────────────────────────┐
 *       │ 로그인이 풀렸어요                        │
 *       │ 터미널에서 그 도구를 한 번 실행해 …      │
 *       │ 자세히 ▸ {"code":-32603,"message":"Inter…│
 *       └─────────────────────────────────────────┘
 * ```
 *
 * 같은 실패가 두 번 있고, **영문 원문이 먼저 읽힌다.** 아래 카드가 그 말을
 * 사람의 말로 옮기고 다음에 할 일까지 대는데, 위 줄이 그 앞에 서서 "이건 내가
 * 읽을 것이 아니구나" 를 먼저 심는다. 이 저장소가 이미 겪고 고친 실패와 같다
 * (`AcpChatPanel.tsx`: *"어댑터가 준 것을 그대로 붙였다 … 소유자: 이렇게
 * 보여주면 사용자가 어떻게 알겠어"*) — 그때는 카드를 고쳤고, 어댑터가 **메시지로도**
 * 같은 말을 보낸다는 것은 못 봤다.
 *
 * ## 왜 「에이전트 말 숨기기」가 아닌가
 *
 * 에이전트가 한 말을 화면이 지우는 것은 위험하다. 그래서 지우는 조건을 최대한
 * 좁힌다: **이미 화면에 떠 있는 오류 원문 안에 통째로 들어 있는 마지막 한 줄**
 * 뿐이다. 실측한 두 문자열이 정확히 그 관계다 —
 *
 * - 메시지: `Failed to authenticate: OAuth session expired and could not be refreshed`
 * - 오류  : `{"code":-32603,"message":"Internal error: Failed to authenticate: OAuth
 *            session expired and could not be refreshed","data":{…}}`
 *
 * 에이전트의 **진짜 답변**이 RPC 오류 문자열의 부분 문자열이 되는 일은 없다.
 * 그래도 짧은 우연(에이전트가 `Error` 한 마디)까지는 막아야 하므로 길이 바닥을
 * 둔다.
 */

/**
 * 이보다 짧은 말은 지우지 않는다. 실측한 가장 짧은 실패 문장이
 * `Failed to authenticate`(22자)이고, 그 절반 아래로는 우연히 포함될 수 있는
 * 평범한 한 마디(`Error`, `Done`, `ok`)의 영역이다.
 */
const MIN_ECHO_LENGTH = 16;

const normalize = (value: string): string => value.replace(/\s+/gu, ' ').trim();

/** 이 말이 지금 화면에 떠 있는 오류의 되풀이인가. */
export function isErrorEcho(text: unknown, error: unknown): boolean {
  if (typeof text !== 'string' || typeof error !== 'string') return false;
  const message = normalize(text);
  if (message.length < MIN_ECHO_LENGTH) return false;
  return normalize(error).includes(message);
}

/**
 * 화면에 그릴 사건 목록. **마지막 한 줄만** 본다 — 대화 도중에 지나간 옛 오류와
 * 같은 말을 에이전트가 나중에 다시 했다면 그건 되풀이가 아니라 그때의 말이다.
 */
export function withoutErrorEcho<T extends { kind: string; text?: string }>(
  events: readonly T[],
  error: unknown,
): readonly T[] {
  const last = events.at(-1);
  if (!last || last.kind !== 'agent') return events;
  return isErrorEcho(last.text, error) ? events.slice(0, -1) : events;
}
