import { describe, expect, it } from 'vitest';

import { GUIDE_ENTRY_PAGE, GUIDE_PAGES, resolveGuidePage } from './guide-pages';

/**
 * 모르는 세그먼트 폴백의 **정직성** 계약.
 *
 * ## 왜 (2026-08-14 걷기 실측)
 *
 * 가이드 본문의 상대 `.md` 링크가 `/guide/ONTOLOGY-ATLAS-SPEC.md` 로 풀렸고,
 * 종전 폴백은 그 주소에 1장을 **말없이** 그렸다 — 404 가 아니라 오배송이라
 * 어떤 게이트에도 안 걸렸다. 그래서 해석 결과가 «어느 장» 과 «요청받은
 * 장인가» 를 분리해 말해야 하고, matched=false 는 화면 배너
 * (`gateway-doc-notice`, `gatewayNav.guideUnknownSegment`)로 이어진다 —
 * 그 배선은 `app/[locale]/guide/[segment]/page.tsx` 에 있다.
 */
describe('resolveGuidePage — 폴백은 대체 사실을 말한다', () => {
  it('실재하는 세그먼트는 그 장을 matched 로 돌려준다', () => {
    for (const page of GUIDE_PAGES) {
      expect(resolveGuidePage(page.segment)).toEqual({ page, matched: true });
    }
  });

  it('마디 없는 /guide 는 첫 장이 정의된 행동이라 matched 다', () => {
    expect(resolveGuidePage(undefined)).toEqual({ page: GUIDE_ENTRY_PAGE, matched: true });
  });

  it('모르는 세그먼트는 첫 장을 주되 matched=false 로 대체를 고지한다', () => {
    // 실제 사고의 세그먼트 — 상대 링크 `../ONTOLOGY-ATLAS-SPEC.md` 가 풀린 값.
    const result = resolveGuidePage('ONTOLOGY-ATLAS-SPEC.md');
    expect(result.page).toEqual(GUIDE_ENTRY_PAGE);
    expect(result.matched, '모르는 세그먼트가 특정 장을 사칭하면 안 된다').toBe(false);
  });
});
