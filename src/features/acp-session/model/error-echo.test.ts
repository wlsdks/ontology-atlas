import { describe, expect, it } from 'vitest';

import { isErrorEcho, withoutErrorEcho } from './error-echo';

/**
 * 실물(설치된 앱, 2026-08-17)에서 잰 두 문자열. 어댑터는 실패를 **메시지로도**
 * 보내고 RPC 도 거절하므로, 화면이 그대로 두면 같은 실패가 두 번 보이고
 * 영문 원문이 평문 카드보다 먼저 읽힌다.
 */
const AGENT_ECHO = 'Failed to authenticate: OAuth session expired and could not be refreshed';
const RPC_ERROR =
  '{"code":-32603,"message":"Internal error: Failed to authenticate: OAuth session expired and could not be refreshed","data":{"errorKind":"authentication_failed"}}';

const agent = (text: string) => ({ kind: 'agent' as const, id: 'a', text });

describe('오류 되풀이 — 같은 실패를 두 번 말하지 않는다', () => {
  it('실측한 그 쌍을 되풀이로 본다', () => {
    expect(isErrorEcho(AGENT_ECHO, RPC_ERROR)).toBe(true);
  });

  it('마지막 한 줄을 지운다 — 카드가 이미 같은 말을 사람 말로 하고 있다', () => {
    const events = [
      { kind: 'user' as const, id: 'u', text: '물어봄' },
      agent(AGENT_ECHO),
    ];
    expect(withoutErrorEcho(events, RPC_ERROR)).toEqual([events[0]]);
  });

  it('진짜 답변은 지우지 않는다', () => {
    const events = [agent('내 프로젝트 노드는 예시 영역을 담고 있어요.')];
    expect(withoutErrorEcho(events, RPC_ERROR)).toEqual(events);
  });

  it('오류가 없으면 아무것도 안 지운다', () => {
    const events = [agent(AGENT_ECHO)];
    expect(withoutErrorEcho(events, null)).toEqual(events);
  });

  it('짧은 한 마디는 우연히 포함돼도 지우지 않는다', () => {
    // `Error` 는 어떤 오류 원문에도 들어 있다. 그 이유로 에이전트의 말을
    // 지우기 시작하면 이건 되풀이 제거가 아니라 검열이다.
    expect(isErrorEcho('Error', RPC_ERROR)).toBe(false);
    expect(isErrorEcho('authenticate', RPC_ERROR)).toBe(false);
  });

  it('마지막이 에이전트 말이 아니면 건드리지 않는다', () => {
    const events = [
      agent(AGENT_ECHO),
      { kind: 'user' as const, id: 'u', text: '다시 해줘' },
    ];
    expect(withoutErrorEcho(events, RPC_ERROR)).toEqual(events);
  });

  it('가운데 있는 옛 오류 메아리는 남긴다 — 그때는 그게 그 순간의 말이었다', () => {
    const events = [
      agent(AGENT_ECHO),
      { kind: 'user' as const, id: 'u', text: '다시' },
      agent('이제 됐어요. 두 노드는 포함 관계예요.'),
    ];
    expect(withoutErrorEcho(events, RPC_ERROR)).toEqual(events);
  });

  it('줄바꿈과 공백 차이에 흔들리지 않는다 — 어댑터마다 감싸는 폭이 다르다', () => {
    expect(isErrorEcho(`Failed to authenticate:\n  OAuth session expired and could not be refreshed`, RPC_ERROR)).toBe(true);
  });

  it('빈 목록과 이상한 값은 그대로 통과한다', () => {
    expect(withoutErrorEcho([], RPC_ERROR)).toEqual([]);
    expect(isErrorEcho(undefined, RPC_ERROR)).toBe(false);
    expect(isErrorEcho(AGENT_ECHO, undefined)).toBe(false);
  });
});
