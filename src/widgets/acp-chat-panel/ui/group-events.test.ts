import { describe, expect, it } from 'vitest';

import { groupEvents } from './group-events';
import type { AcpEvent } from '@/features/acp-session/model/use-acp-session';

/**
 * 도구 줄은 **기다리는 동안** 도움이 되고, 답이 온 뒤에는 답을 밀어낸다.
 * 그래서 가르는 기준은 시간이 아니라 **그 뒤에 무엇이 왔는가**다.
 */
const tool = (id: string): AcpEvent => ({
  kind: 'tool',
  id,
  title: `t-${id}`,
  toolKind: 'other',
  status: 'completed',
});
const agent = (id: string): AcpEvent => ({ kind: 'agent', id, text: '답' });
const user = (id: string): AcpEvent => ({ kind: 'user', id, text: '질문' });

describe('기록 묶기 — 지금 하는 일은 펼치고, 끝난 일은 접는다', () => {
  it('뒤에 답이 왔으면 접는다', () => {
    const out = groupEvents([user('u'), tool('a'), tool('b'), tool('c'), agent('m')]);
    expect(out.map((i) => i.kind)).toEqual(['event', 'toolGroup', 'event']);
    expect(out[1].kind === 'toolGroup' && out[1].events).toHaveLength(3);
  });

  it('마지막 덩어리는 **지금 하고 있는 일**이라 안 접는다', () => {
    const out = groupEvents([user('u'), tool('a'), tool('b'), tool('c')]);
    // 셋 다 그대로 보인다 — 기다리는 사람이 무슨 일이 도는지 봐야 한다.
    expect(out.map((i) => i.kind)).toEqual(['event', 'event', 'event', 'event']);
  });

  it('하나뿐이면 접지 않는다 — 접어도 줄지 않는다', () => {
    const out = groupEvents([tool('a'), agent('m')]);
    expect(out.map((i) => i.kind)).toEqual(['event', 'event']);
  });

  it('덩어리가 여럿이면 각각 판정한다', () => {
    const out = groupEvents([
      tool('a'), tool('b'), agent('m1'),   // 끝난 덩어리 → 접음
      tool('c'), tool('d'),                // 지금 도는 덩어리 → 펼침
    ]);
    expect(out.map((i) => i.kind)).toEqual(['toolGroup', 'event', 'event', 'event']);
  });

  it('아무것도 없으면 아무것도 안 만든다', () => {
    expect(groupEvents([])).toEqual([]);
  });

  it('순서를 바꾸지 않는다', () => {
    const out = groupEvents([user('u'), tool('a'), tool('b'), agent('m'), user('u2')]);
    const ids = out.flatMap((i) => (i.kind === 'toolGroup' ? i.events.map((e) => e.id) : [i.event.id]));
    expect(ids).toEqual(['u', 'a', 'b', 'm', 'u2']);
  });
});
