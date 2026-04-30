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
    projectSlug: 'aslan-iam',
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
    expect(matchesSearch(attrs(), 'aslan')).toBe(true);
  });

  it('matches by label (case-insensitive)', () => {
    expect(matchesSearch(attrs(), 'authentication')).toBe(true);
    expect(matchesSearch(attrs(), 'AUTH')).toBe(true);
    expect(matchesSearch(attrs(), 'service')).toBe(true);
  });

  it('returns false when neither projectSlug nor label contains query', () => {
    expect(matchesSearch(attrs(), 'reactor')).toBe(false);
    expect(matchesSearch(attrs(), 'paravel')).toBe(false);
  });

  it('trims whitespace before comparing', () => {
    expect(matchesSearch(attrs(), '  iam  ')).toBe(true);
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
