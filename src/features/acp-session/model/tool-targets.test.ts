import { describe, expect, it } from 'vitest';

import { readToolTargets } from './tool-targets';

/**
 * Makes the tool row state **which node it touched.**
 *
 * Until now the screen said only "read a concept" with no mention of which. The value was arriving
 * (`rawInput`) and being discarded.
 */

const known = new Set(['capabilities/invoice', 'domains/payment', 'capabilities/refund']);

describe('도구가 만진 노드를 집는다', () => {
  it('`slug` 를 집는다 — 우리 도구에서 가장 흔한 이름', () => {
    expect(readToolTargets({ slug: 'capabilities/invoice' }, known)).toEqual([
      'capabilities/invoice',
    ]);
  });

  it('관계를 만들 때는 양끝을 다 집는다', () => {
    expect(
      readToolTargets({ from: 'capabilities/invoice', to: 'domains/payment' }, known),
    ).toEqual(['capabilities/invoice', 'domains/payment']);
  });

  it('이름을 바꿀 때는 옛 이름과 새 이름을 다 본다 — 다만 **아는 것만** 남는다', () => {
    // The new name is not in the vault yet (so failing to pick it is correct). The old name is.
    expect(
      readToolTargets({ oldSlug: 'capabilities/invoice', newSlug: 'capabilities/bill' }, known),
    ).toEqual(['capabilities/invoice']);
  });

  it('모르는 이름은 안 집는다 — 눌러도 아무 데도 안 가는 것을 만들지 않는다', () => {
    expect(readToolTargets({ slug: 'capabilities/nope' }, known)).toEqual([]);
  });

  it('슬러그가 아닌 인자는 무시한다', () => {
    expect(
      readToolTargets({ query: 'capabilities/invoice', limit: 10 }, known),
    ).toEqual([]);
  });

  it('같은 노드를 두 번 집지 않는다', () => {
    expect(
      readToolTargets({ slug: 'capabilities/invoice', from: 'capabilities/invoice' }, known),
    ).toEqual(['capabilities/invoice']);
  });

  it('인자가 없거나 모양이 다르면 빈손이다 — 지어내지 않는다', () => {
    expect(readToolTargets(undefined, known)).toEqual([]);
    expect(readToolTargets(null, known)).toEqual([]);
    expect(readToolTargets('문자열', known)).toEqual([]);
    expect(readToolTargets({ slug: 42 }, known)).toEqual([]);
  });

  it('아는 이름 집합이 비면 아무것도 안 집는다', () => {
    expect(readToolTargets({ slug: 'capabilities/invoice' }, new Set())).toEqual([]);
  });

  it('너무 많으면 앞의 몇 개만 — 도구 줄이 대화보다 시끄러워지면 안 된다', () => {
    const many = new Set(['a/1', 'a/2', 'a/3', 'a/4']);
    const out = readToolTargets(
      { slug: 'a/1', from: 'a/2', to: 'a/3', targetSlug: 'a/4' },
      many,
    );
    expect(out.length).toBeLessThanOrEqual(3);
  });
});
