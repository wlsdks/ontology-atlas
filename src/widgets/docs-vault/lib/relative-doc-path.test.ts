import { describe, expect, it } from 'vitest';

import { resolveDocLink } from './resolve-doc-link';
import { buildDocLinkMarkdown, relativeDocPath } from './relative-doc-path';

/**
 * The point of this test is not «is the path string pretty» but **does the viewer
 * resolve that link back to the same document**. So the producing side
 * (`relativeDocPath`) and the resolving side (`resolveDocLink`) are measured as a
 * **round trip**. Measuring one side alone can go green while the two disagree,
 * and that is exactly the accident this feature had (the parser passed an encoded
 * URL and the resolving side did not know).
 */

const VAULT = new Set([
  'domains/typed-api',
  'domains/orders',
  'capabilities/fixtures',
  'capabilities/스윕-검증-절차',
  'README',
  'guides/deep/nested-note',
]);

/** Round trip — feed the built link to the viewer's resolver and check the original slug comes back. */
function roundTrip(fromSlug: string, toSlug: string) {
  const href = relativeDocPath(fromSlug, toSlug);
  return resolveDocLink({ href, fromSlug, vaultSlugs: VAULT });
}

describe('relativeDocPath — 만든 링크를 뷰어가 다시 푼다', () => {
  it('다른 폴더로 — 올라갔다 내려간다', () => {
    expect(relativeDocPath('domains/typed-api', 'capabilities/fixtures')).toBe(
      '../capabilities/fixtures.md',
    );
    expect(roundTrip('domains/typed-api', 'capabilities/fixtures')).toEqual({
      kind: 'internal',
      slug: 'capabilities/fixtures',
      anchor: undefined,
    });
  });

  it('같은 폴더로 — `./` 를 붙여 링크임을 눈으로도 알 수 있게', () => {
    expect(relativeDocPath('domains/typed-api', 'domains/orders')).toBe('./orders.md');
    expect(roundTrip('domains/typed-api', 'domains/orders')).toMatchObject({
      kind: 'internal',
      slug: 'domains/orders',
    });
  });

  it('볼트 루트 문서에서 폴더 안으로', () => {
    expect(relativeDocPath('README', 'capabilities/fixtures')).toBe('capabilities/fixtures.md');
    expect(roundTrip('README', 'capabilities/fixtures')).toMatchObject({
      kind: 'internal',
      slug: 'capabilities/fixtures',
    });
  });

  it('깊은 폴더에서 루트 문서로', () => {
    expect(relativeDocPath('guides/deep/nested-note', 'README')).toBe('../../README.md');
    expect(roundTrip('guides/deep/nested-note', 'README')).toMatchObject({
      kind: 'internal',
      slug: 'README',
    });
  });

  /**
   * A Hangul slug is this feature's weak spot. The wikilink side had the same
   * defect — the markdown parser passes URLs percent-encoded and the resolving side
   * did not decode. **An ASCII slug has nothing to encode, so it stays fine and the
   * defect appears only in a Hangul vault.**
   */
  it('한글 슬러그도 왕복한다 — 인코딩되어 도착해도', () => {
    const href = relativeDocPath('domains/typed-api', 'capabilities/스윕-검증-절차');
    expect(href).toBe('../capabilities/스윕-검증-절차.md');
    // Passed through as is
    expect(roundTrip('domains/typed-api', 'capabilities/스윕-검증-절차')).toMatchObject({
      kind: 'internal',
      slug: 'capabilities/스윕-검증-절차',
    });
    // Passed through **in the form the parser encodes** — which is how it really arrives.
    expect(
      resolveDocLink({
        href: encodeURI(href),
        fromSlug: 'domains/typed-api',
        vaultSlugs: VAULT,
      }),
      '퍼센트 인코딩된 링크를 못 풀면 한글 볼트의 모든 링크가 죽는다',
    ).toMatchObject({ kind: 'internal', slug: 'capabilities/스윕-검증-절차' });
  });

  it('앵커를 붙여도 슬러그를 찾는다', () => {
    const href = `${relativeDocPath('domains/typed-api', 'capabilities/fixtures')}#정의`;
    expect(
      resolveDocLink({ href, fromSlug: 'domains/typed-api', vaultSlugs: VAULT }),
    ).toMatchObject({ kind: 'internal', slug: 'capabilities/fixtures', anchor: '정의' });
  });
});

describe('buildDocLinkMarkdown — 링크 문법이 라벨에 깨지지 않는다', () => {
  it('제목을 라벨로 쓴다', () => {
    expect(
      buildDocLinkMarkdown({
        fromSlug: 'domains/typed-api',
        toSlug: 'capabilities/fixtures',
        label: 'Fixtures',
      }),
    ).toBe('[Fixtures](../capabilities/fixtures.md)');
  });

  it('제목이 비면 슬러그를 쓴다 — 빈 라벨을 남기지 않는다', () => {
    expect(
      buildDocLinkMarkdown({
        fromSlug: 'README',
        toSlug: 'capabilities/fixtures',
        label: '   ',
      }),
    ).toBe('[capabilities/fixtures](capabilities/fixtures.md)');
  });

  /** A title is a human-written value — a bracket in it breaks the link on the spot. */
  it('라벨의 대괄호를 이스케이프한다', () => {
    const md = buildDocLinkMarkdown({
      fromSlug: 'README',
      toSlug: 'capabilities/fixtures',
      label: '[초안] 결제',
    });
    expect(md).toBe('[\\[초안\\] 결제](capabilities/fixtures.md)');
  });
});
