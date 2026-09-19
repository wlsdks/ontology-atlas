import { describe, expect, it } from 'vitest';
import { computeCanonicalCensus } from '@/entities/knowledge-graph';
import { buildOntologyBrief } from './ontology-brief';

const anchorMs = Date.parse('2026-09-18T00:00:00Z');

const nodes = [
  { id: 'capabilities/pay', kind: 'capability', createdBy: 'agent:claude', docSlug: 'capabilities/pay' },
  { id: 'capabilities/ship', kind: 'capability', createdBy: 'agent:codex', docSlug: 'capabilities/ship' },
  { id: 'domains/orders', kind: 'domain', createdBy: 'human', docSlug: 'domains/orders' },
  { id: 'elements/cart', kind: 'element', docSlug: null },
  { id: 'projects/shop', kind: 'project', docSlug: 'projects/shop' },
  // The vault readme is the one node the canonical census leaves out, so it must not be counted
  // here either — that is the whole point of sharing the membership rule.
  { id: 'README', kind: 'vault-readme', docSlug: null },
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
    /*
     * Five nodes carry the word "concept" on this screen: the census counts every node that is
     * not the vault readme, and this card has to count the same ones or the two numbers disagree one
     * click apart (walkthrough, 2026-09-20).
     */
    expect(brief.headline).toBe(5);
    expect({ current: brief.current, stale: brief.stale, unknown: brief.unknown }).toEqual({
      current: null,
      stale: null,
      unknown: 5,
    });
    const byId = Object.fromEntries(brief.lines.map((line) => [line.id, line.count]));
    expect(byId['ontology-evidence-moved']).toBe(0);
    expect(byId['ontology-evidence-unchecked']).toBe(5);
    // The agent-written node a person reviewed is not counted.
    expect(byId['ontology-agent-unreviewed']).toBe(1);
    expect(byId['ontology-changed-since']).toBe(3);
    expect(byId['ontology-repair']).toBe(8);
  });

  it('splits concepts by evidence state when the app measured it', () => {
    const brief = buildOntologyBrief({
      nodes,
      docs,
      evidence: { current: new Set(['capabilities/ship']), stale: new Set(['capabilities/pay']), missing: new Set(['domains/orders']), folderOnly: new Set(['elements/cart']) },
      repairCount: 0,
      unmatchedCount: 3,
      anchorMs,
    });
    expect(brief.availability).toBe('measured');
    expect({ current: brief.current, stale: brief.stale, unknown: brief.unknown }).toEqual({
      current: 1,
      stale: 2,
      unknown: 2,
    });
    expect(brief.lines.find((line) => line.id === 'ontology-evidence-moved')?.count).toBe(1);
    expect(brief.lines.find((line) => line.id === 'ontology-evidence-missing')?.count).toBe(1);
    expect(brief.lines.find((line) => line.id === 'ontology-evidence-folder-only')?.count).toBe(1);
    // The project has no evidence state of its own, so it stays honestly unknown rather than
    // dropping out of the total the card printed above.
    expect(brief.lines.find((line) => line.id === 'ontology-evidence-unchecked')?.count).toBe(2);
    expect(brief.lines.find((line) => line.id === 'ontology-unmatched')?.count).toBe(3);
  });
});

describe('the card and the strip count the same thing', () => {
  it('matches the canonical census for the same nodes', () => {
    /*
     * The rule lives in `canonical-census.ts`: every count that uses the word "concept" goes
     * through it. Both numbers are drawn on this one screen, a hundred pixels apart, so this
     * compares them instead of restating either.
     */
    const brief = buildOntologyBrief({ nodes, docs, evidence: null, repairCount: 0, unmatchedCount: 0, anchorMs });
    const census = computeCanonicalCensus(
      nodes.map((node) => ({ ...node, title: node.id })) as never,
      [],
    );
    expect(brief.headline).toBe(census.conceptCount);
    // Idling guard: a fixture with no readme would make the two agree for the wrong reason.
    expect(nodes.some((node) => node.kind === 'vault-readme')).toBe(true);
    expect(census.conceptCount).toBeLessThan(nodes.length);
  });
});
