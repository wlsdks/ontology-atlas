import { describe, expect, it } from 'vitest';

import { chatSuggestions, SUGGESTION_LIMIT } from './chat-suggestions';

/**
 * 추천이 **이 폴더에 대한 것**인지를 잠근다.
 *
 * 일반적인 예시 문장("무엇이든 물어보세요")은 추천이 아니라 장식이다 — 그건
 * 어느 앱에나 붙일 수 있고, 그래서 아무 값도 없다. 여기서 잠그는 성질은
 * 하나다: **지금 볼트에서 실제로 관측된 사실이 있을 때만 그 사실에 대한
 * 추천이 나온다.**
 */

const empty = {
  nodeCount: 0,
  islands: [],
  missingContainment: [],
  unevidenced: [],
};

describe('추천은 이 볼트에서 관측된 사실에서만 나온다', () => {
  it('빈 볼트에는 「짓기」를 권한다 — 고칠 것이 없으니 만들 것을 권해야 한다', () => {
    const out = chatSuggestions({ ...empty, sourceState: 'bound' });
    expect(out[0]?.kind).toBe('bootstrap');
  });

  it('새 볼트에 코드 폴더가 없으면 분석보다 연결을 먼저 권한다', () => {
    const out = chatSuggestions({ ...empty, nodeCount: 5, sourceState: 'unbound' });
    expect(out.map((item) => item.kind)).toEqual(['connectSource']);
  });

  it('소스 연결을 아직 읽는 중에는 틀릴 수 있는 시작 버튼을 먼저 그리지 않는다', () => {
    expect(chatSuggestions({ ...empty, nodeCount: 5, sourceState: 'loading' })).toEqual([]);
  });

  it('끊긴 덩어리가 있으면 그 노드 이름을 들고 나온다', () => {
    const out = chatSuggestions({
      ...empty,
      nodeCount: 40,
      islands: [['capabilities/invoice', 'capabilities/refund']],
    });
    const island = out.find((s) => s.kind === 'island');
    expect(island).toBeDefined();
    // 이름이 없으면 「어딘가 끊겨 있어요」라는 말뿐이고, 그건 추천이 아니다.
    expect(island?.params.first).toBe('capabilities/invoice');
    expect(island?.params.count).toBe(2);
  });

  it('끊긴 덩어리가 없으면 그 추천은 아예 안 나온다', () => {
    const out = chatSuggestions({ ...empty, nodeCount: 40 });
    expect(out.some((s) => s.kind === 'island')).toBe(false);
  });

  it('도메인이 되받지 않는 노드가 있으면 그것을 이름으로 짚는다', () => {
    const out = chatSuggestions({
      ...empty,
      nodeCount: 40,
      missingContainment: [{ slug: 'capabilities/invoice', domain: 'domains/billing' }],
    });
    const fix = out.find((s) => s.kind === 'containment');
    expect(fix?.params.slug).toBe('capabilities/invoice');
    expect(fix?.params.domain).toBe('domains/billing');
  });

  it('코드 근거가 없는 역량이 있으면 그것을 찾아 달라고 권한다', () => {
    const out = chatSuggestions({
      ...empty,
      nodeCount: 40,
      unevidenced: ['capabilities/invoice', 'capabilities/refund', 'capabilities/payout'],
    });
    const ev = out.find((s) => s.kind === 'evidence');
    expect(ev?.params.first).toBe('capabilities/invoice');
    expect(ev?.params.count).toBe(3);
  });

  it('아무 문제가 없어도 빈손으로 두지 않는다 — 물어볼 것 하나는 늘 있다', () => {
    const out = chatSuggestions({ ...empty, nodeCount: 80 });
    expect(out.length).toBeGreaterThan(0);
    expect(out.some((s) => s.kind === 'explain')).toBe(true);
  });

  it('한 번에 세 개까지만 — 고를 것이 많으면 고르지 않게 된다', () => {
    const out = chatSuggestions({
      nodeCount: 40,
      islands: [['a/1', 'a/2'], ['b/1', 'b/2']],
      missingContainment: [
        { slug: 'c/1', domain: 'd/1' },
        { slug: 'c/2', domain: 'd/2' },
      ],
      unevidenced: ['e/1', 'e/2', 'e/3'],
    });
    expect(out.length).toBeLessThanOrEqual(SUGGESTION_LIMIT);
    expect(SUGGESTION_LIMIT).toBe(3);
  });

  it('같은 갈래를 두 번 권하지 않는다 — 세 칸이 같은 말이면 한 칸인 것과 같다', () => {
    const out = chatSuggestions({
      nodeCount: 40,
      islands: [['a/1'], ['b/1'], ['c/1']],
      missingContainment: [],
      unevidenced: [],
    });
    expect(new Set(out.map((s) => s.kind)).size).toBe(out.length);
  });

  it('고칠 것이 있으면 「설명해줘」보다 앞에 온다 — 손이 가는 쪽이 먼저다', () => {
    const out = chatSuggestions({
      ...empty,
      nodeCount: 40,
      islands: [['a/1', 'a/2']],
    });
    const island = out.findIndex((s) => s.kind === 'island');
    const explain = out.findIndex((s) => s.kind === 'explain');
    expect(island).toBeGreaterThanOrEqual(0);
    expect(explain).toBeGreaterThan(island);
  });

  it('빈 볼트에서는 고칠 것을 권하지 않는다 — 고칠 것이 없다', () => {
    const out = chatSuggestions({
      ...empty,
      // 빈 볼트인데 계산기가 뭔가를 뱉었더라도(있을 수 없지만) 짓기가 먼저다.
      islands: [['a/1']],
      sourceState: 'bound',
    });
    expect(out[0]?.kind).toBe('bootstrap');
  });
});
