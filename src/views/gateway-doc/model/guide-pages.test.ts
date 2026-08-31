import { describe, expect, it } from 'vitest';

import {
  GUIDE_ENTRY_PAGE,
  GUIDE_PAGES,
  guideCanonicalPath,
  resolveGuidePage,
} from './guide-pages';

/**
 * The **honesty** contract of the unknown-segment fallback.
 *
 * Measured in a 2026-08-14 walkthrough: a relative `.md` link in a guide body resolved to
 * `/guide/ONTOLOGY-ATLAS-SPEC.md`, and the old fallback drew chapter 1 at that address **silently** — a
 * misdelivery rather than a 404, so no gate caught it. So the resolution result must state «which
 * chapter» and «is it the one requested» separately, and `matched: false` leads to the screen banner
 * (`gateway-doc-notice`, `gatewayNav.guideUnknownSegment`) — that wiring lives in
 * `app/[locale]/guide/[segment]/page.tsx`.
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
    // The segment from the real incident — what the relative link `../ONTOLOGY-ATLAS-SPEC.md` resolved to.
    const result = resolveGuidePage('ONTOLOGY-ATLAS-SPEC.md');
    expect(result.page).toEqual(GUIDE_ENTRY_PAGE);
    expect(result.matched, '모르는 세그먼트가 특정 장을 사칭하면 안 된다').toBe(false);
  });
});

describe('guideCanonicalPath', () => {
  it('첫 장의 중복 세그먼트를 공유 /guide 주소로 통합한다', () => {
    expect(guideCanonicalPath(GUIDE_ENTRY_PAGE)).toBe('guide');
  });

  it('나머지 장은 자기 세그먼트를 canonical 로 유지한다', () => {
    for (const page of GUIDE_PAGES.slice(1)) {
      expect(guideCanonicalPath(page)).toBe(`guide/${page.segment}`);
    }
  });
});
