import { describe, expect, it } from 'vitest';
import type { KnowledgeGraphNode, KnowledgeGraphEdge } from '@/entities/knowledge-graph';
import type { VaultDoc } from '@/entities/docs-vault';
import { buildAnalysisModel } from './analysis-model';
const node = (id: string, kind: string) => ({ id, title: id, kind, evidenceIds: [id] } as KnowledgeGraphNode);
const edge = (from: string, to: string, type = 'contains') => ({ id: `${from}:${type}:${to}`, from, to, type, evidenceIds: [from] } as KnowledgeGraphEdge);
const doc = (slug: string, extra = {}) => ({ slug, frontmatter: extra, meaningFindings: [] } as unknown as VaultDoc);
describe('Analysis recorded relationships', () => {
  it('counts only distinct directed dependencies and excludes ambiguous ownership', () => {
    const nodes = [node('a', 'domain'), node('b', 'domain'), node('x', 'capability'), node('y', 'capability')];
    const dependency = edge('x', 'y', 'depends_on');
    const edges = [edge('a', 'x'), edge('b', 'y'), dependency, dependency, edge('x', 'y', 'related_to')];
    const model = buildAnalysisModel(nodes, edges, []);
    expect(model.pairs.map(pair => [pair.from.id, pair.to.id, pair.edges.length])).toEqual([['a', 'b', 1]]);
    expect(model.dependencyCount).toBe(1);
    const ambiguous = buildAnalysisModel(nodes, [...edges, edge('b', 'x')], []);
    expect(ambiguous.pairs).toHaveLength(0);
    expect(ambiguous.unassigned).toBe(1);
  });
  it('records a real implementation role without claiming a source path', () => {
    const nodes = [node('c', 'capability'), node('e', 'element'), node('phantom', 'element')];
    const model = buildAnalysisModel(nodes, [edge('c', 'e'), edge('c', 'phantom')], [doc('c'), doc('e')]);
    expect(model.anchored).toBe(1);
    expect(model.claims[0].roles.map(role => role.id)).toEqual(['e']);
    expect(model.claims[0].paths).toEqual([]);
    expect(model.claims[0].gaps).toEqual([]);
  });
  it('does not count reverse containment or unchecked documents as inspected', () => {
    const c = { ...doc('c'), meaningFindings: undefined };
    const model = buildAnalysisModel([node('c', 'capability'), node('e', 'element')], [edge('e', 'c')], [c, doc('e')]);
    expect(model.anchored).toBe(0);
    expect(model.inspected).toBe(0);
    expect(model.claims[0].gaps).toEqual(['anchor']);
  });
  it('terminates cyclic containment and distinguishes empty dependency records', () => {
    const model = buildAnalysisModel([node('a', 'capability'), node('b', 'capability')], [edge('a', 'b'), edge('b', 'a')], []);
    expect(model.dependencyCount).toBe(0);
    expect(model.claims).toHaveLength(2);
    expect(model.gaps).toHaveLength(2);
  });
});
