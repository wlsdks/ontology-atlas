import { describe, expect, it } from 'vitest';

import { firstCommitDate, lastCommitDate } from './source-dates';

describe('source dates', () => {
  it('dates a file first added no later than it last changed', () => {
    const first = firstCommitDate('docs/guide/relations.md');
    const last = lastCommitDate(['docs/guide/relations.md']);
    expect(first).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(last).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(new Date(first!).getTime()).toBeLessThanOrEqual(new Date(last!).getTime());
  });

  it('answers nothing for a path Git has never seen', () => {
    expect(firstCommitDate('docs/guide/no-such-chapter.md')).toBeUndefined();
    expect(lastCommitDate(['docs/guide/no-such-chapter.md'])).toBeUndefined();
  });
});
