import { describe, expect, it } from 'vitest';
import { readRecheckMarks, recheckedIds } from './use-rechecked-concepts';

const KNOWN = 'a'.repeat(40);
const UNKNOWN = 'f'.repeat(40);

const nodes = [
  { id: 'pay', evidenceIds: ['capabilities/pay'] },
  { id: 'refund', evidenceIds: ['capabilities/refund'] },
  { id: 'ship', evidenceIds: ['capabilities/ship'] },
  { id: 'bill', evidenceIds: ['capabilities/bill'] },
];
const docs = [
  { slug: 'capabilities/pay', frontmatter: { evidence_checked: KNOWN } },
  { slug: 'capabilities/refund', frontmatter: { evidence_checked: UNKNOWN } },
  { slug: 'capabilities/ship', frontmatter: { evidence_checked: 'yes' } },
  { slug: 'capabilities/bill', frontmatter: { evidence_checked: KNOWN.toUpperCase() } },
];

describe('rechecked concepts', () => {
  it('counts a mark only when Git knows the commit it names and the concept reads current', () => {
    const marks = readRecheckMarks(nodes, docs);
    expect([...marks.keys()]).toEqual(['pay', 'refund']);
    const rechecked = recheckedIds(marks, new Set([KNOWN]), () => true);
    expect([...rechecked]).toEqual(['pay']);
  });

  it('counts a mark naming an unknown commit as none', () => {
    const marks = readRecheckMarks(nodes, docs);
    expect(recheckedIds(marks, new Set(), () => true).size).toBe(0);
  });

  it('drops a known mark once the concept reads stale again', () => {
    const marks = readRecheckMarks(nodes, docs);
    expect(recheckedIds(marks, new Set([KNOWN]), (id) => id !== 'pay').size).toBe(0);
  });
});
