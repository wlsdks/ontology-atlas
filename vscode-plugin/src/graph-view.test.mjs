// Unit tests for buildGraphElements — graph webview data shape (R13 #63).

import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGraphElements } from '../out/graph-elements.js';

const NODES = [
  {
    slug: 'project',
    kind: 'project',
    title: 'oh-my-ontology',
    filePath: '/x/project.md',
  },
  {
    slug: 'domains/auth',
    kind: 'domain',
    title: 'Auth',
    filePath: '/x/domains/auth.md',
    capabilities: ['login'],
  },
  {
    slug: 'capabilities/login',
    kind: 'capability',
    title: 'Login',
    filePath: '/x/capabilities/login.md',
    domain: 'auth',  // tail-only
    elements: ['src/auth.ts'],
  },
];

test('buildGraphElements — 3 노드 → 3 node elements', () => {
  const els = buildGraphElements(NODES);
  const nodes = els.filter((e) => e.group === 'nodes');
  assert.equal(nodes.length, 3);
  assert.deepEqual(
    nodes.map((n) => n.data.id).sort(),
    ['capabilities/login', 'domains/auth', 'project'],
  );
});

test('buildGraphElements — capability → domain edge (tail-only ref 해석)', () => {
  const els = buildGraphElements(NODES);
  const edges = els.filter((e) => e.group === 'edges');
  // capabilities/login.domain = "auth" → domains/auth (tail match)
  const tailEdge = edges.find(
    (e) => e.data.source === 'capabilities/login' && e.data.target === 'domains/auth',
  );
  assert.ok(tailEdge, 'tail-only domain edge should resolve');
  assert.equal(tailEdge.data.label, 'domain');
});

test('buildGraphElements — domain.capabilities[] → capability edge', () => {
  const els = buildGraphElements(NODES);
  const edges = els.filter((e) => e.group === 'edges');
  const cap = edges.find(
    (e) => e.data.source === 'domains/auth' && e.data.target === 'capabilities/login',
  );
  assert.ok(cap);
  assert.equal(cap.data.label, 'capabilities');
});

test('buildGraphElements — capability.elements[] 의 path-like 는 노드 참조 안 됨', () => {
  // src/auth.ts 는 vault 노드 아님 — edge 생성 X
  const els = buildGraphElements(NODES);
  const edges = els.filter((e) => e.group === 'edges');
  const fromLogin = edges.filter((e) => e.data.source === 'capabilities/login');
  for (const e of fromLogin) {
    assert.notEqual(e.data.target, 'src/auth.ts');
  }
});

test('buildGraphElements — duplicate edge 제거', () => {
  const dupNodes = [
    {
      slug: 'a',
      kind: 'capability',
      title: 'A',
      filePath: '/a.md',
      capabilities: ['b', 'b'],
    },
    { slug: 'b', kind: 'capability', title: 'B', filePath: '/b.md' },
  ];
  const els = buildGraphElements(dupNodes);
  const edges = els.filter(
    (e) => e.data.source === 'a' && e.data.target === 'b',
  );
  assert.equal(edges.length, 1, 'duplicate edges should dedupe');
});

test('buildGraphElements — 자기-self edge 제거', () => {
  const selfNodes = [
    {
      slug: 'a',
      kind: 'capability',
      title: 'A',
      filePath: '/a.md',
      capabilities: ['a'], // self-ref
    },
  ];
  const els = buildGraphElements(selfNodes);
  const selfEdges = els.filter(
    (e) => e.data.source === 'a' && e.data.target === 'a',
  );
  assert.equal(selfEdges.length, 0);
});
