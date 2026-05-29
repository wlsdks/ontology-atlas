import { describe, expect, it } from 'vitest';
import {
  matchesCategory,
  matchesSearch,
  passesDepth,
} from './reducer-filter';
import type { SigmaNodeAttrs } from './graph-build';

function attrs(overrides: Partial<SigmaNodeAttrs> = {}): SigmaNodeAttrs {
  return {
    x: 0,
    y: 0,
    size: 5,
    label: 'Authentication Service',
    color: '',
    borderColor: '',
    outerBorderColor: '',
    projectSlug: 'demo-iam',
    categoryId: 'auth',
    isHub: false,
    ownerKey: 'unassigned',
    ...overrides,
  };
}

describe('matchesSearch', () => {
  it('returns true when query is undefined / null / empty / whitespace', () => {
    expect(matchesSearch(attrs(), undefined)).toBe(true);
    expect(matchesSearch(attrs(), '')).toBe(true);
    expect(matchesSearch(attrs(), '   ')).toBe(true);
  });

  it('matches by projectSlug (case-insensitive)', () => {
    expect(matchesSearch(attrs(), 'iam')).toBe(true);
    expect(matchesSearch(attrs(), 'IAM')).toBe(true);
    expect(matchesSearch(attrs(), 'demo')).toBe(true);
  });

  it('matches by label (case-insensitive)', () => {
    expect(matchesSearch(attrs(), 'authentication')).toBe(true);
    expect(matchesSearch(attrs(), 'AUTH')).toBe(true);
    expect(matchesSearch(attrs(), 'service')).toBe(true);
  });

  it('returns false when neither projectSlug nor label contains query', () => {
    expect(matchesSearch(attrs(), 'reactor')).toBe(false);
    expect(matchesSearch(attrs(), 'sample-app')).toBe(false);
  });

  it('trims whitespace before comparing', () => {
    expect(matchesSearch(attrs(), '  iam  ')).toBe(true);
  });

  describe('precomputed searchText (hot-path)', () => {
    it('uses searchText when present — authoritative over raw label / projectSlug', () => {
      // searchText 가 진실원: label 에 "authentication" 이 있어도 searchText
      // 에 없으면 매칭 안 함 → 미리 계산된 필드를 쓴다는 증거.
      expect(
        matchesSearch(
          attrs({ label: 'Authentication Service', searchText: 'demo-iam' }),
          'authentication',
        ),
      ).toBe(false);
      // searchText 에 있으면 매칭.
      expect(
        matchesSearch(
          attrs({ searchText: 'demo-iam\nauthentication service' }),
          'authentication',
        ),
      ).toBe(true);
    });

    it('searchText 경로도 query 대소문자 무시', () => {
      expect(
        matchesSearch(
          attrs({ searchText: 'demo-iam\nauthentication service' }),
          'AUTHENTICATION',
        ),
      ).toBe(true);
    });

    it('searchText 가 lowercased slug\\nlabel 와 동치 (cross-boundary false-positive 없음)', () => {
      // "ab\ncd" 에 "abcd" 쿼리는 매칭되면 안 됨 (어느 필드에도 없음).
      expect(matchesSearch(attrs({ searchText: 'ab\ncd' }), 'abcd')).toBe(false);
      expect(matchesSearch(attrs({ searchText: 'ab\ncd' }), 'ab')).toBe(true);
      expect(matchesSearch(attrs({ searchText: 'ab\ncd' }), 'cd')).toBe(true);
    });

    it('falls back to label / projectSlug when searchText absent', () => {
      expect(matchesSearch(attrs({ searchText: undefined }), 'authentication')).toBe(true);
      expect(matchesSearch(attrs({ searchText: undefined }), 'iam')).toBe(true);
    });

    it('empty query short-circuits even with searchText present', () => {
      expect(matchesSearch(attrs({ searchText: 'demo-iam\nfoo' }), '')).toBe(true);
      expect(matchesSearch(attrs({ searchText: 'demo-iam\nfoo' }), '   ')).toBe(true);
    });
  });
});

describe('matchesCategory', () => {
  it('returns true when activeCategory is null / undefined', () => {
    expect(matchesCategory(attrs(), null)).toBe(true);
    expect(matchesCategory(attrs(), undefined)).toBe(true);
  });

  it('returns true when categoryId matches', () => {
    expect(matchesCategory(attrs(), 'auth')).toBe(true);
  });

  it('returns false when categoryId mismatches', () => {
    expect(matchesCategory(attrs(), 'community')).toBe(false);
  });

  it('returns true when activeCategory is empty string (treated as no filter)', () => {
    expect(matchesCategory(attrs(), '')).toBe(true);
  });
});

describe('passesDepth', () => {
  const depthMap = new Map([
    ['focus', 0],
    ['n1', 1],
    ['n2', 2],
    ['n3', 3],
  ]);

  it('returns true when focus is null / undefined (filter inactive)', () => {
    expect(passesDepth('n1', null, 2, depthMap)).toBe(true);
    expect(passesDepth('n1', undefined, 2, depthMap)).toBe(true);
  });

  it('returns true when limit is null / undefined (filter inactive)', () => {
    expect(passesDepth('n1', 'focus', null, depthMap)).toBe(true);
    expect(passesDepth('n1', 'focus', undefined, depthMap)).toBe(true);
  });

  it('returns true when node depth <= limit', () => {
    expect(passesDepth('focus', 'focus', 2, depthMap)).toBe(true);
    expect(passesDepth('n1', 'focus', 2, depthMap)).toBe(true);
    expect(passesDepth('n2', 'focus', 2, depthMap)).toBe(true);
  });

  it('returns false when node depth > limit', () => {
    expect(passesDepth('n3', 'focus', 2, depthMap)).toBe(false);
  });

  it('returns false when node not in depthMap (disconnected)', () => {
    expect(passesDepth('orphan', 'focus', 2, depthMap)).toBe(false);
  });

  it('handles limit=0 (only focus itself passes)', () => {
    expect(passesDepth('focus', 'focus', 0, depthMap)).toBe(true);
    expect(passesDepth('n1', 'focus', 0, depthMap)).toBe(false);
  });
});
