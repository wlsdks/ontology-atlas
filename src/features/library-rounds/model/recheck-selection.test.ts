import { describe, expect, it } from 'vitest';

import type { RoundPassEntry } from '@/entities/library-round';

import { chooseRecheckCandidates, leftBefore, recheckBasis, type RecheckCandidate } from './recheck-selection';

function candidate(slug: string, docChangedAt: string, moved: string[] = [`src/${slug}.ts`]): RecheckCandidate {
  return { slug, path: `${slug}.md`, docCommit: `c-${slug}`, docChangedAt, moved, basis: recheckBasis(`c-${slug}`, moved.map((path) => ({ path, commit: 'x' }))) };
}

function run(roundId: string, concepts: { slug: string; outcome: 'accurate' | 'outdated' | 'left'; basis?: string }[], undoOf?: string): RoundPassEntry {
  return {
    v: 1, id: `p-${Math.random()}`, roundId, kind: 'recheck', startedAt: '', endedAt: '', outcome: 'rechecked', checked: concepts.length,
    stale: [], written: [], refused: [], called: [], agentTurns: 1, summary: '', trigger: 'clock',
    recheck: { concepts: concepts.map((concept) => ({ ...concept, path: `${concept.slug}.md`, files: [] })), sentBytes: 0, waiting: 0, skippedUncommitted: 0, ignored: 0, ...(undoOf ? { undoOf } : {}) },
  };
}

describe('which concepts a recheck takes', () => {
  it('takes the longest-waiting documents first and skips uncommitted ones and ones a person raised', () => {
    const { ordered, skippedUncommitted } = chooseRecheckCandidates({
      candidates: [
        candidate('capabilities/new', '2026-11-20T00:00:00Z'),
        candidate('domains/old', '2026-01-01T00:00:00Z'),
        candidate('elements/edited', '2026-02-01T00:00:00Z'),
        candidate('capabilities/code-edited', '2026-02-01T00:00:00Z', ['src/wip.ts']),
        candidate('capabilities/raised', '2026-01-02T00:00:00Z'),
      ],
      uncommitted: new Set(['elements/edited.md', 'src/wip.ts']),
      raised: new Set(['capabilities/raised']),
      left: new Map(),
    });
    expect(ordered.map((item) => item.slug)).toEqual(['domains/old', 'capabilities/new']);
    expect(skippedUncommitted).toBe(2);
  });

  it('does not send again a concept left undecided until its document or files change', () => {
    const same = candidate('capabilities/pay', '2026-01-01T00:00:00Z');
    const left = leftBefore([run('r1', [{ slug: 'capabilities/pay', outcome: 'left', basis: same.basis }])], 'r1');
    expect(chooseRecheckCandidates({ candidates: [same], uncommitted: new Set(), raised: new Set(), left }).ordered).toEqual([]);
    const moved = { ...same, basis: recheckBasis('c-pay', [{ path: 'src/capabilities/pay.ts', commit: 'y' }]) };
    expect(chooseRecheckCandidates({ candidates: [moved], uncommitted: new Set(), raised: new Set(), left }).ordered).toEqual([moved]);
  });

  it('reads only this schedule\'s runs, and a later answer replaces an earlier "left"', () => {
    const entries = [
      run('r1', [{ slug: 'a', outcome: 'left', basis: 'b1' }, { slug: 'b', outcome: 'left', basis: 'b2' }]),
      run('r1', [{ slug: 'a', outcome: 'outdated' }]),
      run('r2', [{ slug: 'c', outcome: 'left', basis: 'b3' }]),
      run('r1', [{ slug: 'b', outcome: 'accurate' }], 'p0'),
    ];
    expect([...leftBefore(entries, 'r1')]).toEqual([['b', 'b2']]);
  });
});
