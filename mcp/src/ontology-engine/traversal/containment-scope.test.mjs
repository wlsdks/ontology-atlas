import assert from 'node:assert/strict';
import test from 'node:test';

import { createContainmentScope } from './containment-scope.mjs';

function scopeOf(rows, children = {}) {
  const nodes = rows.map((row) => ({ title: row.slug, ...row }));
  const nodeBySlug = new Map(nodes.map((node) => [node.slug, node]));
  const parents = {};
  for (const [parent, list] of Object.entries(children)) {
    for (const child of list) parents[child] = [...(parents[child] ?? []), parent];
  }
  const link = (table) => (slug) => (table[slug] ?? []).map((next) => ({ next, edge: { via: 'contains' } }));
  return createContainmentScope({
    nodes,
    nodeBySlug,
    resolve: (slug) => {
      if (!nodeBySlug.has(slug)) throw new Error(`unknown ${slug}`);
      return slug;
    },
    resolveOptional: (slug) => (typeof slug === 'string' && nodeBySlug.has(slug) ? slug : null),
    containmentChildren: link(children),
    containmentParentsFor: link(parents),
    partitionScopeEdges: () => ({ internal: [], boundary: [], external: [], unresolved: [] }),
    topHubs: () => [],
  });
}

test('a containment scope holds the root and everything beneath it once, even around a loop', () => {
  const { collectContainmentScope } = scopeOf(
    [{ slug: 'p', kind: 'project' }, { slug: 'd', kind: 'domain' }, { slug: 'c', kind: 'capability' }, { slug: 'x', kind: 'capability' }],
    { p: ['d'], d: ['c'], c: ['d'] },
  );
  assert.deepEqual([...collectContainmentScope('p')].sort(), ['c', 'd', 'p']);
  assert.deepEqual([...collectContainmentScope('x')], ['x']);
});

test('a node belongs to the nearest domain: itself, its declared domain, or the first domain above it, all inside the scope', () => {
  const { nearestDomainFor } = scopeOf(
    [
      { slug: 'p', kind: 'project' },
      { slug: 'd1', kind: 'domain' },
      { slug: 'd2', kind: 'domain' },
      { slug: 'declared', kind: 'capability', domain: 'd2' },
      { slug: 'nested', kind: 'element' },
      { slug: 'bridge', kind: 'capability' },
      { slug: 'loose', kind: 'capability' },
      { slug: 'misdeclared', kind: 'capability', domain: 'bridge' },
    ],
    { p: ['d1', 'd2'], d1: ['bridge'], bridge: ['nested'] },
  );
  const scope = new Set(['p', 'd1', 'd2', 'declared', 'nested', 'bridge', 'loose', 'misdeclared']);
  assert.equal(nearestDomainFor('d1', scope), 'd1');
  assert.equal(nearestDomainFor('declared', scope), 'd2');
  assert.equal(nearestDomainFor('nested', scope), 'd1');
  assert.equal(nearestDomainFor('loose', scope), null);
  assert.equal(nearestDomainFor('misdeclared', scope), null, 'a declared domain that is not a domain node does not count');
  assert.equal(nearestDomainFor('d1', new Set(['p'])), null, 'a domain outside the scope belongs to no domain in it');
  assert.equal(nearestDomainFor('p', scope), null);
  assert.equal(nearestDomainFor('declared', new Set(['declared'])), null, 'a declared domain outside the scope does not count');
  assert.equal(nearestDomainFor('nested', new Set(['nested', 'bridge'])), null, 'a domain above the scope does not count');
  assert.equal(nearestDomainFor('nested', new Set(['p'])), null, 'a node outside the scope has no domain in it');
});

test('a project root must be a project, and a missing slug is accepted only when exactly one project exists', () => {
  const one = scopeOf([{ slug: 'p', kind: 'project' }, { slug: 'd', kind: 'domain' }]);
  assert.equal(one.resolveProjectRoot(undefined), 'p');
  assert.equal(one.resolveProjectRoot('p'), 'p');
  assert.throws(() => one.resolveProjectRoot('d'), /^Error: project "d" must resolve to a kind: project node\.$/);
  const none = scopeOf([{ slug: 'd', kind: 'domain' }]);
  assert.throws(() => none.resolveProjectRoot(''), /requires a project slug because the compiled graph has no kind: project root/);
  const many = scopeOf([{ slug: 'b', kind: 'project' }, { slug: 'a', kind: 'project' }]);
  assert.throws(() => many.resolveProjectRoot(undefined), /because multiple project roots exist: a, b$/);
});

test('a domain root must be a domain', () => {
  const { resolveDomainRoot } = scopeOf([{ slug: 'd', kind: 'domain' }, { slug: 'c', kind: 'capability' }]);
  assert.equal(resolveDomainRoot('d'), 'd');
  assert.throws(() => resolveDomainRoot('c'), /^Error: domain "c" must resolve to a kind: domain node\.$/);
});

test('scope helpers sort nodes by slug, intersect scopes and cap node lists with a limited flag', () => {
  const { sortedNodesInScope, intersectSlugSets, limitedNodeList } = scopeOf([{ slug: 'b' }, { slug: 'a' }]);
  assert.deepEqual(sortedNodesInScope(new Set(['b', 'a', 'gone'])).map((node) => node.slug), ['a', 'b']);
  assert.deepEqual([...intersectSlugSets(new Set(['a', 'b']), new Set(['b', 'c']))], ['b']);
  const list = limitedNodeList([{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }], 2);
  assert.equal(list.total, 3);
  assert.equal(list.limited, true);
  assert.deepEqual(list.nodes.map((node) => node.slug), ['a', 'b']);
});
