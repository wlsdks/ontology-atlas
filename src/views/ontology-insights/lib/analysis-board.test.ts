import { describe, expect, it } from 'vitest';
import type { KnowledgeGraphNode, KnowledgeGraphEdge } from '@/entities/knowledge-graph';
import type { VaultDoc } from '@/entities/docs-vault';
import { buildAnalysisModel } from './analysis-model';
import { buildAnalysisBoard, busiestInOrder, laneAnchor, orderCardsByNeighbours, orderLanesByFlow, UNASSIGNED_LANE } from './analysis-board';

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

  it('folds a long lane to its most connected cards and keeps them in board order', () => {
    const lane = ['a', 'b', 'c', 'hub', 'd'], links = new Map([['hub', 5], ['c', 2], ['a', 1]]);
    expect(busiestInOrder(lane, id => links.get(id) ?? 0, null, 3)).toEqual(['a', 'c', 'hub']);
    expect(busiestInOrder(lane, id => links.get(id) ?? 0, 'd', 3)).toEqual(['c', 'hub', 'd']);
  });

  it('seats connected cards under their neighbours so parallel declarations stop crossing', () => {
    const links = [{ from: 'a1', to: 'b3' }, { from: 'a2', to: 'b2' }, { from: 'a3', to: 'b1' }, { from: 'c1', to: 'b1' }];
    const [top, middle, bottom] = orderCardsByNeighbours([['a1', 'a2', 'a3'], ['b1', 'b2', 'b3', 'quiet'], ['c1']], links);
    const at = (lane: string[], id: string) => lane.indexOf(id);
    const inverted = links.filter(({ from }) => from.startsWith('a')).some((link, _index, rows) => rows.some(other => (at(top!, link.from) - at(top!, other.from)) * (at(middle!, link.to) - at(middle!, other.to)) < 0));
    expect(inverted).toBe(false);
    expect(middle!.at(-1)).toBe('quiet');
    expect(bottom).toEqual(['c1']);
  });

  it('pulls a card that depends on a lane title to the front of its lane', () => {
    const [lane] = orderCardsByNeighbours([['x', 'y', 'z'], ['w']], [{ from: 'z', to: laneAnchor('other') }, { from: 'x', to: 'w' }, { from: 'y', to: 'w' }]);
    expect(lane![0]).toBe('z');
  });

  it('opens a channel in every lane a declaration skips and nowhere else', () => {
    const nodes = [node('a', 'domain'), node('b', 'domain'), node('c', 'domain'), ...['top', 'left', 'right', 'bottom'].map(id => node(id, 'capability'))];
    const edges = [edge('a', 'top'), edge('b', 'left'), edge('b', 'right'), edge('c', 'bottom'), edge('top', 'left', 'depends_on'), edge('left', 'bottom', 'depends_on'), edge('top', 'bottom', 'depends_on'), edge('bottom', 'right', 'depends_on'), edge('right', 'top', 'depends_on')];
    const board = buildAnalysisBoard(buildAnalysisModel(nodes, edges, []));
    const skip = board.links.filter(link => Math.abs(link.fromLane - link.toLane) > 1);
    expect(skip.length).toBeGreaterThan(0);
    for (const link of skip) {
      const crossed = board.lanes.filter((_, index) => index > Math.min(link.fromLane, link.toLane) && index < Math.max(link.fromLane, link.toLane));
      for (const lane of crossed) expect(lane.passes.flatMap(pass => pass.edges)).toContain(link.edge.id);
    }
    expect(board.lanes.flatMap(lane => lane.passes.flatMap(pass => pass.edges))).toHaveLength(skip.length);
  });
});
