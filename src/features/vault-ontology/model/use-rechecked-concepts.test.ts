import { describe, expect, it } from 'vitest';
import { readRecheckMarks, recheckedIds } from './use-rechecked-concepts';

const MARK = 'a'.repeat(40);

const nodes = [
  { id: 'pay', evidenceIds: ['capabilities/pay'] },
  { id: 'refund', evidenceIds: ['capabilities/refund'] },
  { id: 'ship', evidenceIds: ['capabilities/ship'] },
];
const docs = [
  { slug: 'capabilities/pay', frontmatter: { evidence_checked: MARK } },
  { slug: 'capabilities/refund', frontmatter: { evidence_checked: MARK } },
  { slug: 'capabilities/ship', frontmatter: { evidence_checked: 'yes' } },
];

describe('rechecked concepts', () => {
  it('asks Git about each mark shaped like a commit, by document', () => {
    expect([...readRecheckMarks(nodes, docs)]).toEqual([
      ['pay', { path: 'capabilities/pay.md', mark: MARK }],
      ['refund', { path: 'capabilities/refund.md', mark: MARK }],
    ]);
  });

  it('counts a concept only when its mark stands and it reads current', () => {
    const marks = readRecheckMarks(nodes, docs);
    expect([...recheckedIds(marks, new Set(['capabilities/pay.md']), () => true)]).toEqual(['pay']);
    expect(recheckedIds(marks, new Set(['capabilities/pay.md']), (id) => id !== 'pay').size).toBe(0);
  });
});
