import { describe, expect, it } from 'vitest';
import { buildSinceList } from './since-list';

const anchorMs = Date.parse('2026-09-18T00:00:00Z');

describe('buildSinceList', () => {
  it('merges the four cores newest first, keeps the total, and skips what predates the anchor', () => {
    const list = buildSinceList({
      docs: [
        { slug: 'capabilities/pay', title: 'Payments', kind: 'capability', updatedAt: '2026-09-18T03:00:00Z' },
        { slug: 'wiki/notes', title: 'Notes', kind: null, updatedAt: '2026-09-18T04:00:00Z' },
        { slug: 'domains/old', title: 'Old', kind: 'domain', updatedAt: '2026-09-01T00:00:00Z' },
      ],
      wikiLog: [{ at: '2026-09-18T05:00:00Z', kind: 'compile', summary: 'a.md → budget (new)' }],
      guideFiles: [
        { path: 'AGENTS.md', mtimeMs: Date.parse('2026-09-18T01:00:00Z') },
        { path: '.claude/rules/git.md', mtimeMs: null },
      ],
      agentCalls: [{ at: '2026-09-18T06:00:00Z', tool: 'add_concept', target: 'capabilities/refund' }],
      anchorMs,
      limit: 3,
    });
    expect(list.total).toBe(4);
    expect(list.rows.map((row) => [row.core, row.kind, row.label])).toEqual([
      ['agent', 'agent-call', 'add_concept · capabilities/refund'],
      ['wiki', 'wiki-log', 'compile · a.md → budget (new)'],
      ['ontology', 'concept-doc', 'Payments'],
    ]);
  });
});
