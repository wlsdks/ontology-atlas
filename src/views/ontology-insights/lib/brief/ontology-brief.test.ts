import { describe, expect, it } from 'vitest';
import { buildOntologyBrief } from './ontology-brief';

const anchorMs = Date.parse('2026-09-18T00:00:00Z');

const nodes = [
  { id: 'capabilities/pay', kind: 'capability', createdBy: 'agent:claude', docSlug: 'capabilities/pay' },
  { id: 'capabilities/ship', kind: 'capability', createdBy: 'agent:codex', docSlug: 'capabilities/ship' },
  { id: 'domains/orders', kind: 'domain', createdBy: 'human', docSlug: 'domains/orders' },
  { id: 'elements/cart', kind: 'element', docSlug: null },
  { id: 'projects/shop', kind: 'project', docSlug: 'projects/shop' },
];
const docs = new Map([
  ['capabilities/pay', { reviewedBy: null, updatedAt: '2026-09-18T05:00:00Z' }],
  ['capabilities/ship', { reviewedBy: 'human:j', updatedAt: '2026-09-01T00:00:00Z' }],
  ['domains/orders', { reviewedBy: null, updatedAt: '2026-09-19T00:00:00Z' }],
  ['projects/shop', { reviewedBy: null, updatedAt: '2026-09-19T00:00:00Z' }],
]);

describe('buildOntologyBrief', () => {
  it('is app-only without evidence states: every concept is unknown, none quietly current', () => {
    const brief = buildOntologyBrief({ nodes, docs, evidence: null, repairCount: 8, unmatchedCount: 0, anchorMs });
    expect(brief.availability).toBe('app-only');
    expect({ current: brief.current, stale: brief.stale, unknown: brief.unknown }).toEqual({
      current: null,
      stale: null,
      unknown: 4,
    });
    const byId = Object.fromEntries(brief.lines.map((line) => [line.id, line.count]));
    expect(byId['ontology-evidence-moved']).toBe(0);
    expect(byId['ontology-evidence-unchecked']).toBe(4);
    // The agent-written node a person reviewed is not counted; the project is not a concept.
    expect(byId['ontology-agent-unreviewed']).toBe(1);
    expect(byId['ontology-changed-since']).toBe(2);
    expect(byId['ontology-repair']).toBe(8);
  });

  it('splits concepts by evidence state when the app measured it', () => {
    const brief = buildOntologyBrief({
      nodes,
      docs,
      evidence: { current: new Set(['capabilities/ship', 'domains/orders']), stale: new Set(['capabilities/pay']) },
      repairCount: 0,
      unmatchedCount: 3,
      anchorMs,
    });
    expect(brief.availability).toBe('measured');
    expect({ current: brief.current, stale: brief.stale, unknown: brief.unknown }).toEqual({
      current: 2,
      stale: 1,
      unknown: 1,
    });
    expect(brief.lines.find((line) => line.id === 'ontology-evidence-moved')?.count).toBe(1);
    expect(brief.lines.find((line) => line.id === 'ontology-evidence-unchecked')?.count).toBe(1);
    expect(brief.lines.find((line) => line.id === 'ontology-unmatched')?.count).toBe(3);
  });
});
