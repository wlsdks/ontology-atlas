import { describe, expect, it } from 'vitest';
import { computeCanonicalCensus } from '@/entities/knowledge-graph';
import { buildOntologyBrief, evidenceAvailability } from './ontology-brief';

const anchorMs = Date.parse('2026-09-18T00:00:00Z');

const nodes = [
  { id: 'capabilities/pay', kind: 'capability', createdBy: 'agent:claude', docSlug: 'capabilities/pay' },
  { id: 'capabilities/ship', kind: 'capability', createdBy: 'agent:codex', docSlug: 'capabilities/ship' },
  { id: 'domains/orders', kind: 'domain', createdBy: 'human', docSlug: 'domains/orders' },
  { id: 'elements/cart', kind: 'element', docSlug: null },
  { id: 'projects/shop', kind: 'project', docSlug: 'projects/shop' },
  // The vault readme is the one node the canonical census leaves out, so it is not counted here either.
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
    // This card counts the same nodes as the census strip, so the two "concept" numbers agree.
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

  it.each(['reading', 'unreadable', 'no-source'] as const)('keeps absent evidence unknown in the app: %s', (evidenceAvailability) => {
    const brief = buildOntologyBrief({ nodes, docs, evidence: null, evidenceAvailability, repairCount: 0, unmatchedCount: 0, anchorMs });
    expect(brief.availability).toBe(evidenceAvailability);
    expect(brief.current).toBeNull();
    expect(brief.stale).toBeNull();
    expect(brief.unknown).toBe(5);
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
    // The project has no evidence state of its own, so it stays unknown rather than dropping out of the total.
    expect(brief.lines.find((line) => line.id === 'ontology-evidence-unchecked')?.count).toBe(2);
    expect(brief.lines.find((line) => line.id === 'ontology-unmatched')?.count).toBe(3);
  });
});

describe('the card and the strip count the same thing', () => {
  it('matches the canonical census for the same nodes', () => {
    // Every "concept" count goes through `canonical-census.ts`; both numbers show on one screen, so this compares them.
    const brief = buildOntologyBrief({ nodes, docs, evidence: null, repairCount: 0, unmatchedCount: 0, anchorMs });
    const census = computeCanonicalCensus(
      nodes.map((node) => ({ ...node, title: node.id })) as never,
      [],
    );
    expect(brief.headline).toBe(census.conceptCount);
    // Idling guard: without a readme the two would agree for the wrong reason.
    expect(nodes.some((node) => node.kind === 'vault-readme')).toBe(true);
    expect(census.conceptCount).toBeLessThan(nodes.length);
  });

  // The headline cannot name more unknown concepts than the folder holds, although three lines overlap.
  it('never offers the headline more unknown concepts than the folder holds', () => {
    const brief = buildOntologyBrief({ nodes, docs, evidence: null, repairCount: 8, unmatchedCount: 0, anchorMs });
    const lineSum = brief.lines
      .filter((line) => line.state === 'unknown')
      .reduce((sum, line) => sum + line.count, 0);
    expect(lineSum, 'the lines themselves still each answer their own question').toBe(6);
    expect(brief.headlineTotals?.unknown).toBe(5);
    expect(brief.headlineTotals?.unknown).toBeLessThanOrEqual(brief.headline ?? 0);
  });
});

// A walk in flight is reading, whatever else is known.
describe('evidenceAvailability', () => {
  const base = { bridge: true, walkable: true, walkPending: false, walkFailed: false, noSource: false };

  it('reads while the walk is in flight, even with no project bound', () => {
    expect(evidenceAvailability({ ...base, walkPending: true, noSource: true })).toBe('reading');
    expect(evidenceAvailability({ ...base, walkPending: true })).toBe('reading');
  });

  it('asks for a repository once the walk has answered with nothing and none is bound', () => {
    expect(evidenceAvailability({ ...base, walkFailed: true, noSource: true })).toBe('no-source');
    expect(evidenceAvailability({ ...base, walkFailed: true })).toBe('unreadable');
  });

  it('stops reading when the folder has no native path to walk', () => {
    expect(evidenceAvailability({ ...base, walkable: false })).toBe('unreadable');
    expect(evidenceAvailability({ ...base, walkable: false, noSource: true })).toBe('no-source');
  });

  it('never tells a browser it is reading', () => {
    expect(evidenceAvailability({ ...base, bridge: false, walkPending: true })).toBe('app-only');
  });
});
