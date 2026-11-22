import { describe, expect, it } from 'vitest';
import { branchParts } from './BranchName';

describe('branchParts', () => {
  it('keeps the kind apart and the closing characters whole', () => {
    expect(branchParts('feat/library-first-run-stage')).toEqual({ kind: 'feat/', middle: 'library-first', tail: '-run-stage' });
    expect(branchParts('refactor/graphlayoutworkerpool')).toEqual({ kind: 'refactor/', middle: 'graphlayoutwo', tail: 'rkerpool' });
    expect(branchParts('fix/short-name')).toEqual({ kind: 'fix/', middle: 'short-name', tail: '' });
    expect(branchParts('main')).toEqual({ kind: '', middle: 'main', tail: '' });
  });
});
