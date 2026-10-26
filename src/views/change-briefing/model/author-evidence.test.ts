import { describe, expect, it } from 'vitest';
import { authorEvidence } from './author-evidence';

describe('explicit author evidence', () => {
  it('does not infer status from change titles, resolved headings or unmarked prose', () => {
    const passages = [{ id: 'fix', text: 'fix(map): restore the flat map\n' }, { id: 'resolved', text: '## Resolved issues\n\nThe layout failure was fixed.\n' }];
    expect(authorEvidence(passages, 'checks')).toEqual([]);
    expect(authorEvidence(passages, 'limits')).toEqual([]);
  });
  it('separates an inline remaining caveat from corrected failures in a test plan', () => {
    const text = '- The initial browser check failed; corrected and rerun.\n- **Remaining motion caveat:** first frames 53 ms and 57 ms\n  exceed the 50 ms target.\n- Final checks passed.\n';
    const passages = [{ id: 'heading', text: '## Test plan\n\n' }, { id: 'body', text }, { id: 'after', text: '## Changes\n\nFixed another failure.\n' }];
    expect(authorEvidence(passages, 'limits')).toEqual([{ id: 'body', text: '- **Remaining motion caveat:** first frames 53 ms and 57 ms\n  exceed the 50 ms target.\n' }]);
    const checks = authorEvidence(passages, 'checks');
    expect(checks).toEqual([{ id: 'body', text: '- The initial browser check failed; corrected and rerun.\n- Final checks passed.\n' }]);
  });
  it('recognizes the measured performance limit from the real author convention', () => {
    const text = '- Remaining performance limit: first frames failed at 53 ms and 57 ms\n  against 50 ms; subsequent frames stayed below the bar.\n';
    const passages = [{ id: 'heading', text: '## Test plan\n\n' }, { id: 'body', text }];
    expect(authorEvidence(passages, 'limits')).toEqual([{ id: 'body', text }]);
    expect(authorEvidence(passages, 'checks')).toEqual([]);
  });
  it('quotes explicit fields verbatim and ends inline scope at the next bullet or paragraph', () => {
    expect(authorEvidence([{ id: 'p1', text: 'Checks: 22/22 browser cases passed.\n' }, { id: 'p2', text: 'This later unmarked paragraph is not validation.\n' }], 'checks')).toEqual([{ id: 'p1', text: 'Checks: 22/22 browser cases passed.\n' }]);
    expect(authorEvidence([{ id: 'p', text: 'Limits: offline only.\n- Fixed: old error corrected.\n' }], 'limits')).toEqual([{ id: 'p', text: 'Limits: offline only.\n' }]);
  });
});
