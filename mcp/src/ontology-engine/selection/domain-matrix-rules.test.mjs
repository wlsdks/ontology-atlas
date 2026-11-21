import assert from 'node:assert/strict';
import test from 'node:test';

import { assignNodesToDomains, tallyDomainEdges } from './domain-matrix-rules.mjs';

const edge = (from, to, via = 'dependencies', extra = {}) => ({ from, to, via, resolved: true, external: false, ref: to, ...extra });
const statsFor = (...slugs) => new Map(slugs.map((slug) => [slug, {
  slug, nodes: 0, outgoing: 0, incoming: 0, selfEdges: 0, externalEdges: 0, unresolvedEdges: 0,
}]));

test('each scoped node is counted on its nearest domain, and a node with none stays unassigned', () => {
  const domainStats = statsFor('d1', 'd2');
  const nearest = { a: 'd1', b: 'd1', c: 'd2', 'outside-row': 'not-in-stats' };
  const { domainForNode, assignedNodes } = assignNodesToDomains({
    scopedNodes: [{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }, { slug: 'loose' }, { slug: 'outside-row' }],
    scope: new Set(),
    nearestDomainFor: (slug) => nearest[slug] ?? null,
    domainStats,
  });
  assert.equal(assignedNodes, 4);
  assert.deepEqual([...domainForNode], [['a', 'd1'], ['b', 'd1'], ['c', 'd2'], ['outside-row', 'not-in-stats']]);
  assert.equal(domainStats.get('d1').nodes, 2);
  assert.equal(domainStats.get('d2').nodes, 1);
});

function tally(edges, overrides = {}) {
  const domainStats = statsFor('d1', 'd2');
  const domainForNode = new Map([['a1', 'd1'], ['a2', 'd1'], ['b1', 'd2'], ['ghost', 'd1']]);
  const scope = new Set(['a1', 'a2', 'b1', 'x']);
  const result = tallyDomainEdges({ edges, scope, typeSet: null, domainForNode, domainStats, ...overrides });
  return { ...result, domainStats };
}

test('an edge inside one domain is a self edge on that domain only', () => {
  const { selfDomainEdges, crossDomainEdges, domainStats, connectionMap } = tally([edge('a1', 'a2')]);
  assert.equal(selfDomainEdges, 1);
  assert.equal(crossDomainEdges, 0);
  assert.equal(domainStats.get('d1').selfEdges, 1);
  assert.equal(connectionMap.size, 0);
});

test('an edge between two domains counts outgoing on the source domain and incoming on the target, grouped by pair', () => {
  const { crossDomainEdges, domainStats, connectionMap } = tally([
    edge('a1', 'b1'), edge('a2', 'b1', 'capabilities'), edge('a1', 'b1'), edge('a1', 'b1'), edge('a1', 'b1'),
  ]);
  assert.equal(crossDomainEdges, 5);
  assert.equal(domainStats.get('d1').outgoing, 5);
  assert.equal(domainStats.get('d2').incoming, 5);
  const row = connectionMap.get('d1\0d2');
  assert.equal(row.count, 5);
  assert.deepEqual([...row.byRelation], [['dependencies', 4], ['capabilities', 1]]);
  assert.equal(row.examples.length, 3, 'only three example edges are kept per pair');
  assert.equal(connectionMap.has('d2\0d1'), false, 'direction matters: the pair key is from then to');
  const both = tally([edge('a1', 'b1'), edge('b1', 'a1')]).connectionMap;
  assert.deepEqual([...both.keys()], ['d1\0d2', 'd2\0d1'], 'each direction is its own connection');
});

test('external and unresolved edges are counted apart and never become domain connections', () => {
  const { externalEdges, unresolvedEdges, crossDomainEdges, domainStats, connectionMap } = tally([
    edge('a1', 'src/x.ts', 'elements', { resolved: false, external: true }),
    edge('a1', 'missing', 'dependencies', { resolved: false }),
    edge('b1', 'out-of-scope', 'dependencies'),
    edge('b1', 'x', 'dependencies'),
  ]);
  assert.equal(externalEdges, 1);
  assert.equal(unresolvedEdges, 2, 'an edge whose target is outside the scope is unresolved for this matrix');
  assert.equal(crossDomainEdges, 0);
  assert.equal(domainStats.get('d1').externalEdges, 1);
  assert.equal(domainStats.get('d1').unresolvedEdges, 1);
  assert.equal(domainStats.get('d2').unresolvedEdges, 1);
  assert.equal(connectionMap.size, 0);
});

test('an edge that starts outside the scope, or from a node with no domain, is not counted', () => {
  const { selfDomainEdges, crossDomainEdges, externalEdges, unresolvedEdges } = tally([
    edge('elsewhere', 'a1'), edge('x', 'a1', 'dependencies'), edge('a1', 'x'), edge('ghost', 'a1'), edge('ghost', 'b1'),
  ]);
  assert.equal(selfDomainEdges, 0);
  assert.equal(crossDomainEdges, 0);
  assert.equal(externalEdges, 0);
  assert.equal(unresolvedEdges, 0);
});

test('only the requested relation types are counted', () => {
  const edges = [edge('a1', 'b1', 'dependencies'), edge('a1', 'b1', 'capabilities')];
  assert.equal(tally(edges, { typeSet: new Set(['capabilities']) }).crossDomainEdges, 1);
  assert.equal(tally(edges, { typeSet: new Set(['dependencies']) }).crossDomainEdges, 1);
  assert.equal(tally(edges).crossDomainEdges, 2);
});
