import { describe, expect, it } from 'vitest';
import type { AnalysisFinding } from '@/entities/analysis-record';
import type { KnowledgeProjectInsight } from '@/entities/knowledge-graph';
import { resolveAnalysisFindingTarget } from './analysis-finding-target';

const insight = {
  nodes: [{ id: 'capability:cart', kind: 'capability', agentSlug: 'capabilities/cart' }, { id: 'element:session', kind: 'element', agentSlug: 'elements/cart-session' }],
  edges: [{ from: 'capability:cart', to: 'element:session', type: 'related_to', evidenceIds: ['other'] }, { from: 'capability:cart', to: 'element:session', type: 'contains', evidenceIds: ['capabilities/cart'] }],
} as unknown as KnowledgeProjectInsight;
const finding: AnalysisFinding = { id: 'f-1', category: 'relation', title: 'Check this relation', detail: 'Question', targetSlugs: ['capabilities/cart', 'elements/cart-session'], evidenceSlugs: ['capabilities/cart'], roleIds: [], relation: { from: 'capabilities/cart', to: 'elements/cart-session', type: 'elements' }, suggestedAction: '' };

describe('analysis finding navigation', () => {
  it('resolves an agent relation alias to the exact map predicate and declaring document', () => {
    expect(resolveAnalysisFindingTarget(finding, insight)).toEqual({ kind: 'edge', edge: { sourceId: 'capability:cart', targetId: 'element:session', relationType: 'contains', declaredBySlug: 'capabilities/cart' } });
  });
  it('falls back to an existing target and never invents a missing location', () => {
    expect(resolveAnalysisFindingTarget({ ...finding, relation: null }, insight)).toEqual({ kind: 'node', nodeId: 'capability:cart' });
    expect(resolveAnalysisFindingTarget({ ...finding, relation: null, targetSlugs: ['missing'] }, insight)).toBeNull();
  });
});
