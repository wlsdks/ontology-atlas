import { describe, expect, it } from 'vitest';
import type { KnowledgeGraphNode, KnowledgeGraphEdge } from '@/entities/knowledge-graph';
import type { VaultDoc } from '@/entities/docs-vault';
import { buildAnalysisModel } from './analysis-model';
import { buildAnalysisBoard, declarationsThatFit, laneAnchor, UNASSIGNED_LANE, type BoardLink } from './analysis-board';

const node = (id: string, kind: string) => ({ id, title: id, kind, evidenceIds: [id] } as KnowledgeGraphNode);
const edge = (from: string, to: string, type = 'contains') => ({ id: `${from}:${type}:${to}`, from, to, type, evidenceIds: [from] } as KnowledgeGraphEdge);
const doc = (slug: string) => ({ slug, frontmatter: {}, meaningFindings: [] } as unknown as VaultDoc);
describe('Analysis connection board', () => {
  it('draws an element dependency from the capability that contains it and a bare domain from its responsibility', () => {
    const nodes = [node('a', 'domain'), node('b', 'domain'), node('pay', 'capability'), node('ledger', 'element'), node('refund', 'capability')];
    const edges = [edge('a', 'pay'), edge('pay', 'ledger'), edge('b', 'refund'), edge('ledger', 'refund', 'depends_on'), edge('refund', 'a', 'depends_on')];
    const board = buildAnalysisBoard(buildAnalysisModel(nodes, edges, [doc('pay'), doc('ledger'), doc('refund')]));
    expect(board.links.map(link => [link.from, link.to])).toEqual(expect.arrayContaining([['pay', 'refund'], ['refund', laneAnchor('a')]]));
  });

  it('names a concept no capability records as its role instead of the whole responsibility', () => {
    const nodes = [node('a', 'domain'), node('b', 'domain'), node('pay', 'capability'), node('ledger', 'element'), node('journal', 'element'), node('refund', 'capability')];
    const edges = [edge('a', 'pay'), edge('pay', 'ledger'), edge('ledger', 'journal'), edge('b', 'refund'), edge('journal', 'refund', 'depends_on')];
    const board = buildAnalysisBoard(buildAnalysisModel(nodes, edges, [doc('pay'), doc('ledger'), doc('journal'), doc('refund')]));
    expect(board.links.map(link => [link.from, link.to])).toEqual([['journal', 'refund']]);
    expect(board.endpoints.get('journal')?.kind).toBe('element');
    expect(board.endpoints.has(laneAnchor('a'))).toBe(false);
  });

  it('gathers capabilities no single responsibility owns in a last lane', () => {
    const nodes = [node('a', 'domain'), node('b', 'domain'), node('alpha', 'capability'), node('target', 'capability'), node('loose', 'capability')];
    const edges = [edge('a', 'alpha'), edge('b', 'target'), edge('alpha', 'target', 'depends_on')];
    const board = buildAnalysisBoard(buildAnalysisModel(nodes, edges, []));
    expect(board.lanes.map(lane => lane.id)).toEqual([laneAnchor('a'), laneAnchor('b'), UNASSIGNED_LANE]);
    expect(board.lanes.at(-1)!.claims.map(claim => claim.node.id)).toEqual(['loose']);
  });

  it('groups every cross declaration once per direction, the most declared responsibility and pair first', () => {
    const nodes = [node('a', 'domain'), node('b', 'domain'), node('c', 'domain'), node('x', 'capability'), node('x2', 'capability'), node('y', 'capability'), node('z', 'capability')];
    const edges = [edge('a', 'x'), edge('a', 'x2'), edge('b', 'y'), edge('c', 'z'),
      edge('x', 'z', 'depends_on'), edge('x2', 'z', 'depends_on'), edge('x', 'y', 'depends_on'), edge('y', 'z', 'depends_on'), edge('x', 'y', 'calls')];
    const model = buildAnalysisModel(nodes, edges, []);
    const board = buildAnalysisBoard(model);
    const shape = (grouping: 'needs' | 'provides') => board.groups[grouping].map(group => [group.anchor.id, group.declarations, group.pairs.map(pair => `${pair.pair.from.id}>${pair.pair.to.id}:${pair.links.length}`)]);
    expect(shape('needs')).toEqual([['a', 3, ['a>c:2', 'a>b:1']], ['b', 1, ['b>c:1']]]);
    expect(shape('provides')).toEqual([['c', 3, ['a>c:2', 'b>c:1']], ['b', 1, ['a>b:1']]]);
    expect(board.links).toHaveLength(model.crossCount);
    expect(new Set(board.links.map(link => link.edge.id)).size).toBe(model.crossCount);
  });

  it('keeps one pair identity across both directions so a selection survives regrouping', () => {
    const nodes = [node('a', 'domain'), node('b', 'domain'), node('x', 'capability'), node('y', 'capability')];
    const board = buildAnalysisBoard(buildAnalysisModel(nodes, [edge('a', 'x'), edge('b', 'y'), edge('x', 'y', 'depends_on')], []));
    expect(board.groups.provides[0]!.pairs[0]).toBe(board.groups.needs[0]!.pairs[0]);
    expect(board.links[0]!.pairId).toBe(board.groups.needs[0]!.pairs[0]!.pair.id);
  });
});

describe('declarationsThatFit', () => {
  const link = (from: string, to: string) => ({ edge: { id: `${from}>${to}` }, pairId: 'pair', from, to }) as BoardLink;
  const links = [link('a', 'x'), link('a', 'y'), link('b', 'y'), link('c', 'z'), link('c', 'x')];
  const ids = (kept: readonly BoardLink[]) => kept.map(item => item.edge.id);

  it('keeps every declaration between the cards it shows and none that would leave a card without a line', () => {
    expect(ids(declarationsThatFit(links, 2, 'a>x', () => false))).toEqual(['a>x', 'a>y', 'b>y']);
  });

  it('seats the selected declaration first, then the searched ones', () => {
    expect(ids(declarationsThatFit(links, 1, 'c>z', () => false))).toEqual(['c>z']);
    expect(ids(declarationsThatFit(links, 2, 'a>x', item => item.from === 'c'))).toEqual(['a>x', 'c>z', 'c>x']);
  });

  it('keeps all of them when both sides fit', () => {
    expect(declarationsThatFit(links, 3, 'a>x', () => false)).toHaveLength(links.length);
  });
});
