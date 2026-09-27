import { describe, expect, it } from 'vitest';

import {
  GUIDE_ENTRY_PAGE,
  GUIDE_PAGES,
  guideCanonicalPath,
  resolveGuidePage,
} from './guide-pages';

/**
 * An unknown segment must say it substituted: `matched: false` drives the `gateway-doc-notice` banner
 * (`gatewayNav.guideUnknownSegment`) wired in `app/[locale]/guide/[segment]/page.tsx`.
 */
describe('resolveGuidePage fallback reports that it substituted', () => {
  it('returns the page for an existing segment as matched', () => {
    for (const page of GUIDE_PAGES) {
      expect(resolveGuidePage(page.segment)).toEqual({ page, matched: true });
    }
  });

  it('treats a bare /guide as matched because the first page is its defined target', () => {
    expect(resolveGuidePage(undefined)).toEqual({ page: GUIDE_ENTRY_PAGE, matched: true });
  });

  it('returns the first page with matched=false for an unknown segment', () => {
    // What the relative link `../ONTOLOGY-ATLAS-SPEC.md` resolved to.
    const result = resolveGuidePage('ONTOLOGY-ATLAS-SPEC.md');
    expect(result.page).toEqual(GUIDE_ENTRY_PAGE);
    expect(result.matched, 'an unknown segment must not pose as a specific page').toBe(false);
  });
});

describe('guideCanonicalPath', () => {
  it('canonicalizes the first page segment to the shared /guide address', () => {
    expect(guideCanonicalPath(GUIDE_ENTRY_PAGE)).toBe('guide');
  });

  it('keeps its own segment as canonical for every other page', () => {
    for (const page of GUIDE_PAGES.slice(1)) {
      expect(guideCanonicalPath(page)).toBe(`guide/${page.segment}`);
    }
  });
});
