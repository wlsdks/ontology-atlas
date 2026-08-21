import { describe, expect, it } from 'vitest';

import { groupEvents } from './group-events';
import type { AcpEvent } from '@/features/acp-session/model/use-acp-session';

const tool = (id: string): AcpEvent => ({
  kind: 'tool',
  id,
  title: `t-${id}`,
  toolKind: 'other',
  status: 'completed',
});
const thought = (id: string): AcpEvent => ({ kind: 'thought', id, text: `생각-${id}` });
const agent = (id: string): AcpEvent => ({ kind: 'agent', id, text: `답-${id}` });
const user = (id: string): AcpEvent => ({ kind: 'user', id, text: `질문-${id}` });

describe('기록 묶기 — 답변과 작업 과정을 차례별로 분리한다', () => {
  it('한 차례의 생각과 도구를 하나의 작업 과정으로 묶는다', () => {
    const out = groupEvents([
      user('u'),
      thought('a'),
      tool('b'),
      agent('m1'),
      thought('c'),
      tool('d'),
      agent('m2'),
    ]);

    expect(out.map((item) => item.kind)).toEqual([
      'event',
      'workGroup',
      'event',
      'event',
    ]);
    expect(out[1].kind === 'workGroup' && out[1].events.map((event) => event.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
    expect(out.slice(2).map((item) => item.kind === 'event' && item.event.id)).toEqual([
      'm1',
      'm2',
    ]);
  });

  it('작업이 하나뿐이어도 본문과 분리한다', () => {
    const out = groupEvents([user('u'), thought('a'), agent('m')]);
    expect(out.map((item) => item.kind)).toEqual(['event', 'workGroup', 'event']);
  });

  it('다음 사용자 말이 새 작업 과정의 경계다', () => {
    const out = groupEvents([
      user('u1'),
      thought('a'),
      agent('m1'),
      user('u2'),
      tool('b'),
      agent('m2'),
    ]);
    expect(out.map((item) => item.kind)).toEqual([
      'event',
      'workGroup',
      'event',
      'event',
      'workGroup',
      'event',
    ]);
  });

  it('작업 과정 내부 순서와 본문 순서는 각각 보존한다', () => {
    const out = groupEvents([
      user('u'),
      tool('a'),
      agent('m1'),
      thought('b'),
      tool('c'),
      agent('m2'),
    ]);
    const work = out.find((item) => item.kind === 'workGroup');
    expect(work?.kind === 'workGroup' && work.events.map((event) => event.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(
      out
        .filter((item) => item.kind === 'event')
        .map((item) => item.kind === 'event' && item.event.id),
    ).toEqual(['u', 'm1', 'm2']);
  });

  it('아무것도 없으면 아무것도 만들지 않는다', () => {
    expect(groupEvents([])).toEqual([]);
  });
});
