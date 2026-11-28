/**
 * Summary-freshness timelines for `tests/contract/analysis/summary-freshness-parity.contract.test.ts`.
 * Each case lists revisions oldest first (`day` counts from 2026-08-01); the verdicts the script
 * server gave for them are recorded in `summary-freshness-golden.json`.
 */

export const SUMMARY_FRESHNESS_BASE = '2026-08-01T00:00:00Z';

export const SUMMARY_FRESHNESS_CASES = [
  {
    name: 'membership moved after the prose',
    kind: 'domain',
    timeline: [
      { day: 0, body: 'covers alpha', children: ['capabilities/alpha'] },
      { day: 10, body: 'covers alpha', children: ['capabilities/alpha', 'capabilities/beta'] },
    ],
  },
  {
    name: 'prose re-written after the membership moved',
    kind: 'domain',
    timeline: [
      { day: 0, body: 'covers alpha', children: ['capabilities/alpha'] },
      { day: 4, body: 'covers alpha', children: ['capabilities/alpha', 'capabilities/beta'] },
      { day: 6, body: 'covers alpha and beta', children: ['capabilities/alpha', 'capabilities/beta'] },
    ],
  },
  {
    name: 'one commit changed both, which is a re-judgement',
    kind: 'domain',
    timeline: [
      { day: 0, body: 'covers alpha', children: ['capabilities/alpha'] },
      { day: 7, body: 'covers alpha and beta', children: ['capabilities/alpha', 'capabilities/beta'] },
    ],
  },
  {
    name: 'a removal counts the same as an addition',
    kind: 'domain',
    timeline: [
      { day: 0, body: 'covers both', children: ['capabilities/alpha', 'capabilities/beta'] },
      { day: 5, body: 'covers both', children: ['capabilities/alpha'] },
    ],
  },
  {
    name: 'a reordered containment array is not a change',
    kind: 'domain',
    timeline: [
      { day: 0, body: 'text', children: ['capabilities/alpha', 'capabilities/beta'] },
      { day: 11, body: 'text', children: ['capabilities/beta', 'capabilities/alpha'] },
    ],
  },
  {
    name: 'a duplicate member is not a change',
    kind: 'domain',
    timeline: [
      { day: 0, body: 'text', children: ['capabilities/alpha'] },
      { day: 9, body: 'text', children: ['capabilities/alpha', 'capabilities/alpha'] },
    ],
  },
  {
    name: 'nothing moved at all',
    kind: 'domain',
    timeline: [
      { day: 0, body: 'text', children: ['capabilities/alpha'] },
      { day: 20, body: 'text', children: ['capabilities/alpha'] },
    ],
  },
  {
    name: 'a project is a summary kind too',
    kind: 'project',
    timeline: [
      { day: 0, body: 'holds one domain', children: ['domains/alpha'] },
      { day: 14, body: 'holds one domain', children: ['domains/alpha', 'domains/beta'] },
    ],
  },
  {
    name: 'an element is not a summary kind',
    kind: 'element',
    timeline: [
      { day: 0, body: 'text', children: ['capabilities/alpha'] },
      { day: 14, body: 'text', children: ['capabilities/alpha', 'capabilities/beta'] },
    ],
  },
  {
    name: 'a summary node holding nothing',
    kind: 'domain',
    timeline: [
      { day: 0, body: 'text', children: [] },
      { day: 14, body: 'other text', children: [] },
    ],
  },
  {
    name: 'a single revision cannot separate the clocks',
    kind: 'domain',
    timeline: [{ day: 0, body: 'text', children: ['capabilities/alpha'] }],
  },
];
