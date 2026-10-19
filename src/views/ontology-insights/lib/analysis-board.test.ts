import { describe, expect, it } from 'vitest';
import type { KnowledgeGraphNode, KnowledgeGraphEdge } from '@/entities/knowledge-graph';
import type { VaultDoc } from '@/entities/docs-vault';
import { buildAnalysisModel } from './analysis-model';
import { buildAnalysisBoard, laneAnchor, orderLanesByFlow, UNASSIGNED_LANE } from './analysis-board';

const node = (id: string, kind: string) => ({ id, title: id, kind, evidenceIds: [id] } as KnowledgeGraphNode);
const edge = (from: string, to: string, type = 'contains') => ({ id: `${from}:${type}:${to}`, from, to, type, evidenceIds: [from] } as KnowledgeGraphEdge);
const doc = (slug: string) => ({ slug, frontmatter: {}, meaningFindings: [] } as unknown as VaultDoc);
const weights = (rows: [string, string, number][]) => {
  const map = new Map<string, Map<string, number>>();
  for (const [from, to, weight] of rows) map.set(from, new Map([...(map.get(from) ?? []), [to, weight]]));
  return map;
};

describe('Analysis project board', () => {
  it('puts the heaviest pairs in adjacent lanes and prefers left-to-right flow', () => {
    const order = orderLanesByFlow(['code', 'human', 'agent', 'meaning'], weights([['agent', 'meaning', 9], ['meaning', 'code', 4], ['agent', 'code', 3], ['code', 'meaning', 3], ['human', 'meaning', 2]]));
    expect(Math.abs(order.indexOf('agent') - order.indexOf('meaning'))).toBe(1);
    expect(order.indexOf('agent')).toBeLessThan(order.indexOf('meaning'));
  });

  it('keeps the given order when no lanes are connected', () => {
    expect(orderLanesByFlow(['b', 'a', 'c'], new Map())).toEqual(['b', 'a', 'c']);
  });

  it('still pulls connected lanes together when there are too many lanes to search exactly', () => {
    const many = Array.from({ length: 12 }, (_, index) => `d${index}`);
    const order = orderLanesByFlow(many, weights([['d11', 'd0', 5], ['d0', 'd6', 4], ['d3', 'd9', 2]]));
    expect(order.indexOf('d0') - order.indexOf('d11')).toBe(1);
    expect(order.indexOf('d6') - order.indexOf('d0')).toBe(1);
    expect(order.indexOf('d9') - order.indexOf('d3')).toBe(1);
  });

  it('draws an element dependency from the capability that contains it and a bare domain from its lane', () => {
    const nodes = [node('a', 'domain'), node('b', 'domain'), node('pay', 'capability'), node('ledger', 'element'), node('refund', 'capability')];
    const edges = [edge('a', 'pay'), edge('pay', 'ledger'), edge('b', 'refund'), edge('ledger', 'refund', 'depends_on'), edge('refund', 'a', 'depends_on')];
    const board = buildAnalysisBoard(buildAnalysisModel(nodes, edges, [doc('pay'), doc('ledger'), doc('refund')]));
    expect(board.links.map(link => [link.from, link.to])).toEqual(expect.arrayContaining([['pay', 'refund'], ['refund', laneAnchor('a')]]));
    for (const link of board.links) expect(link.fromLane).not.toBe(link.toLane);
  });

  it('lists connected capabilities first in their lane and gathers ownerless ones in a last lane', () => {
    const nodes = [node('a', 'domain'), node('b', 'domain'), node('alpha', 'capability'), node('beta', 'capability'), node('target', 'capability'), node('loose', 'capability')];
    const edges = [edge('a', 'alpha'), edge('a', 'beta'), edge('b', 'target'), edge('beta', 'target', 'depends_on')];
    const board = buildAnalysisBoard(buildAnalysisModel(nodes, edges, []));
    const laneA = board.lanes.find(lane => lane.id === laneAnchor('a'))!;
    expect(laneA.claims.map(claim => claim.node.id)).toEqual(['beta', 'alpha']);
    expect(board.lanes.at(-1)).toMatchObject({ id: UNASSIGNED_LANE, domain: null });
    expect(board.lanes.at(-1)!.claims.map(claim => claim.node.id)).toEqual(['loose']);
  });

  it('orders declarations from the top lanes down so stepping reads the board in order', () => {
    const nodes = [node('a', 'domain'), node('b', 'domain'), node('c', 'domain'), node('x', 'capability'), node('y', 'capability'), node('z', 'capability')];
    const edges = [edge('a', 'x'), edge('b', 'y'), edge('c', 'z'), edge('x', 'z', 'depends_on'), edge('x', 'y', 'depends_on'), edge('y', 'z', 'depends_on'), edge('x', 'y', 'calls')];
    const model = buildAnalysisModel(nodes, [...edges, { ...edge('x', 'y', 'depends_on'), id: 'x:again:y' }], []);
    const board = buildAnalysisBoard(model);
    const spans = board.links.map(link => [Math.min(link.fromLane, link.toLane), Math.max(link.fromLane, link.toLane)]);
    expect(spans).toEqual([...spans].sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!));
    expect(board.links).toHaveLength(model.crossCount);
  });
});
