import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTraversalQueries } from './traversal-queries.mjs';

function graph(edges, isolated = []) {
  const nodeBySlug = new Map(isolated.map(slug => [slug, { slug, title: slug, kind: 'element' }]));
  const outgoing = new Map(), incoming = new Map();
  for (const edge of edges) {
    for (const slug of [edge.from, edge.to]) nodeBySlug.set(slug, { slug, title: slug, kind: 'element' });
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    if (!incoming.has(edge.to)) incoming.set(edge.to, []);
    outgoing.get(edge.from).push(edge);
    incoming.get(edge.to).push(edge);
  }
  return createTraversalQueries({ nodeBySlug, outgoing, incoming, resolve(slug) { if (!nodeBySlug.has(slug)) throw new Error(`unknown: ${slug}`); return slug; } });
}
function edge(from, to, via = 'dependencies', extra = {}) {
  return { id: `${from}:${via}:${to}`, from, to, via, ref: to, resolved: true, external: false, ...extra };
}

describe('shortest path reconstruction', () => {
  it('preserves the first sorted shortest route, edge direction and rationale', () => {
    const queries = graph([
      edge('a', 'c'), edge('c', 'd'),
      edge('a', 'b', 'dependencies', { rationale: 'owns the boundary' }),
      edge('a', 'b', 'relates'), edge('d', 'b'),
    ]);
    const result = queries.path('a', 'd');
    assert.deepEqual(result.hops, ['a', 'b', 'd']);
    assert.deepEqual(result.edges, [
      { id: 'a:dependencies:b', from: 'a', to: 'b', via: 'dependencies', rationale: 'owns the boundary', traversedFrom: 'a', traversedTo: 'b' },
      { id: 'd:dependencies:b', from: 'd', to: 'b', via: 'dependencies', traversedFrom: 'b', traversedTo: 'd' },
    ]);
    assert.deepEqual(result.nodes.map(node => node.slug), result.hops);
    assert.equal(result.hopCount, 2);
    assert.deepEqual(queries.path('a', 'd', { direction: 'outgoing' }).hops, ['a', 'c', 'd']);
    assert.deepEqual(queries.path('d', 'a', { direction: 'incoming' }).hops, ['d', 'c', 'a']);
    assert.equal(queries.path('a', 'd', { types: ['relates'] }).found, false);
    assert.equal(queries.path('a', 'd', { maxHops: 1 }).found, false);
  });

  it('preserves zero hops, cycles, unresolved edges and the maximum depth boundary', () => {
    const edges = Array.from({ length: 21 }, (_, index) => edge(`n${index}`, `n${index + 1}`));
    edges.push(edge('n1', 'n0'), edge('n0', 'n21', 'relates', { resolved: false }));
    const queries = graph(edges);
    assert.equal(queries.path('n0', 'n20', { maxHops: 20 }).hopCount, 20);
    assert.equal(queries.path('n0', 'n21', { maxHops: 20 }).found, false);
    assert.deepEqual(queries.path('n0', 'n0', { maxHops: 0 }).hops, ['n0']);
    assert.equal(queries.path('n0', 'n1', { maxHops: 0 }).found, false);
    assert.throws(() => queries.path('missing', 'missing'), /unknown/);
    for (const maxHops of [-1, 0.5, 21]) assert.throws(() => queries.path('n0', 'n1', { maxHops }));
  });

  it('projects only edges in the answer after exploring a wide frontier', () => {
    let projections = 0;
    const edges = Array.from({ length: 2000 }, (_, index) => edge('root', `a${index}`));
    for (const row of edges) Object.defineProperty(row, 'id', { get() { projections++; return `${row.from}:${row.to}`; } });
    edges.push(edge('root', 'z-target'));
    const queries = graph(edges, ['unreachable']);
    projections = 0;
    const result = queries.path('root', 'z-target', { direction: 'outgoing' });
    assert.ok(edges.length > 1000);
    assert.deepEqual(result.hops, ['root', 'z-target']);
    assert.equal(result.edges.length, 1);
    assert.equal(projections, 0, 'unreturned edges must not be projected');
    assert.equal(queries.path('root', 'unreachable').found, false);
    assert.equal(projections, 0, 'an absent path must not project candidate edges');
  });
});
