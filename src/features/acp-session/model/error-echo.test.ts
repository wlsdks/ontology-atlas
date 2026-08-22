import { describe, expect, it } from 'vitest';

import { isErrorEcho, withoutErrorEcho } from './error-echo';

/**
 * The two strings measured on the real thing (installed app, 2026-08-17). The adapter sends the
 * failure **as a message too** and also rejects the RPC, so leaving the screen as-is shows the same
 * failure twice, with the English original reading before the plain-language card.
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
    // `Error` is contained in any error text. Starting to erase what the agent said for that reason is
    // not echo removal but censorship.
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
