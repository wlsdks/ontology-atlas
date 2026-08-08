import { describe, expect, it } from 'vitest';

import { resolveDocLink } from './resolve-doc-link';
import { buildDocLinkMarkdown, relativeDocPath } from './relative-doc-path';

/**
 * 이 시험의 핵심은 «경로 문자열이 예쁜가» 가 아니다 — **뷰어가 그 링크를 다시
 * 그 문서로 풀어내는가** 다. 그래서 만드는 쪽(`relativeDocPath`)과 푸는 쪽
 * (`resolveDocLink`)을 **왕복**으로 잰다. 한쪽만 재면 둘이 어긋난 채로 초록이
 * 될 수 있고, 실제로 그게 이 기능에서 났던 사고다(파서가 URL 을 인코딩해
 * 넘기는 것을 푸는 쪽이 몰랐다).
 */

const VAULT = new Set([
  'domains/typed-api',
  'domains/orders',
  'capabilities/fixtures',
  'capabilities/스윕-검증-절차',
  'README',
  'guides/deep/nested-note',
]);

/** 왕복 — 만든 링크를 뷰어의 해소기에 넣어 원래 슬러그가 나오는지 본다. */
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
   * 한글 슬러그가 이 기능의 급소다. 위키링크 쪽에서 같은 결함이 났다 — 마크다운
   * 파서가 URL 을 퍼센트 인코딩해서 넘기는데 푸는 쪽이 디코드를 안 했다.
   * **영문 슬러그는 인코딩할 것이 없어 멀쩡하므로 한글 볼트에서만 보인다.**
   */
  it('한글 슬러그도 왕복한다 — 인코딩되어 도착해도', () => {
    const href = relativeDocPath('domains/typed-api', 'capabilities/스윕-검증-절차');
    expect(href).toBe('../capabilities/스윕-검증-절차.md');
    // 그대로 넣었을 때
    expect(roundTrip('domains/typed-api', 'capabilities/스윕-검증-절차')).toMatchObject({
      kind: 'internal',
      slug: 'capabilities/스윕-검증-절차',
    });
    // **파서가 인코딩해 넘긴 형태**로 넣었을 때 — 실제로 이렇게 도착한다.
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

  /** 제목은 사람이 쓴 값이다 — 대괄호가 들어오면 링크가 그 자리에서 끊긴다. */
  it('라벨의 대괄호를 이스케이프한다', () => {
    const md = buildDocLinkMarkdown({
      fromSlug: 'README',
      toSlug: 'capabilities/fixtures',
      label: '[초안] 결제',
    });
    expect(md).toBe('[\\[초안\\] 결제](capabilities/fixtures.md)');
  });
});
