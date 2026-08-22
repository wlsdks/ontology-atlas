import { describe, expect, it } from 'vitest';

import { linkSlugs } from './link-slugs';

/**
 * Picks **only names of nodes that really exist** out of chat text.
 *
 * The common approach of linking anything shaped like `a/b` cannot be used here — an agent's answers
 * are full of file paths (`src/features/acp-session/model/x.ts`), URLs, and dates, and turning all of
 * them into nodes creates a link on every other word that goes nowhere when pressed. **Because we
 * have the graph**, only known names are picked.
 */

const known = new Set([
  'capabilities/invoice',
  'domains/payment',
  'elements/checkout-form',
]);

describe('아는 이름만 집는다', () => {
  it('실재하는 노드 이름을 집는다', () => {
    const out = linkSlugs('먼저 capabilities/invoice 를 봤어요.', known);
    expect(out).toEqual([
      { text: '먼저 ' },
      { text: 'capabilities/invoice', slug: 'capabilities/invoice' },
      { text: ' 를 봤어요.' },
    ]);
  });

  it('모르는 이름은 그냥 글자로 둔다 — 눌러도 아무 데도 안 가는 링크를 만들지 않는다', () => {
    const out = linkSlugs('src/features/acp-session/model/x.ts 를 고쳤어요.', known);
    expect(out).toEqual([{ text: 'src/features/acp-session/model/x.ts 를 고쳤어요.' }]);
  });

  it('파일 경로 안에 아는 이름이 들어 있어도 집지 않는다 — 그건 그 노드가 아니다', () => {
    // `docs/ontology/capabilities/invoice.md` is a file, not a reference to that node.
    const out = linkSlugs('docs/ontology/capabilities/invoice.md 를 열었어요', known);
    expect(out.some((s) => 'slug' in s)).toBe(false);
  });

  it('꼬리만 붙은 파일 이름도 집지 않는다 — 앞이 아니라 **뒤**가 가르는 경우', () => {
    // With no path in front, the leading boundary check passes. Only the trailing rule catches this,
    // so without this case that rule could be deleted unnoticed.
    const out = linkSlugs('capabilities/invoice.md 를 열었어요', known);
    expect(out.some((s) => 'slug' in s)).toBe(false);
  });

  it('한 줄에 여러 개가 있어도 전부 집는다', () => {
    const out = linkSlugs('capabilities/invoice 를 domains/payment 에 붙였어요', known);
    expect(out.filter((s) => 'slug' in s).map((s) => s.text)).toEqual([
      'capabilities/invoice',
      'domains/payment',
    ]);
  });

  it('아는 이름이 없으면 조각내지 않는다 — 쓸데없이 원소를 늘리지 않는다', () => {
    expect(linkSlugs('그냥 문장이에요', known)).toEqual([{ text: '그냥 문장이에요' }]);
  });

  it('빈 글은 빈 결과다', () => {
    expect(linkSlugs('', known)).toEqual([]);
  });

  it('아는 이름 집합이 비면 아무것도 안 집는다', () => {
    expect(linkSlugs('capabilities/invoice', new Set())).toEqual([
      { text: 'capabilities/invoice' },
    ]);
  });

  it('겹치는 이름은 **긴 쪽**을 집는다 — 짧은 쪽을 먼저 집으면 뒤가 잘린다', () => {
    const both = new Set(['a/b', 'a/b-c']);
    const out = linkSlugs('a/b-c 를 봤어요', both);
    expect(out[0]).toEqual({ text: 'a/b-c', slug: 'a/b-c' });
  });

  it('바로 앞뒤가 글자면 안 집는다 — 이름의 일부일 뿐이다', () => {
    const out = linkSlugs('xcapabilities/invoicey', known);
    expect(out.some((s) => 'slug' in s)).toBe(false);
  });

  it('괄호·따옴표·마침표 옆은 집는다 — 문장에서 실제로 그렇게 쓴다', () => {
    for (const text of [
      '(capabilities/invoice)',
      '「capabilities/invoice」',
      'capabilities/invoice.',
      '`capabilities/invoice`',
    ]) {
      expect(
        linkSlugs(text, known).some((s) => 'slug' in s),
        `${text} 에서 못 집었다`,
      ).toBe(true);
    }
  });
});
