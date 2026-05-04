// Unit tests for computeBacklinksLocally — offline fallback used when
// the MCP server is unavailable (R13 #52).
//
// We can't import the function directly because it's defined inside
// extension.ts (which imports vscode runtime). Instead this test mirrors
// the same logic on a local copy and verifies behavior parity. When
// MCP is reachable the plugin uses the server; this test guards the
// fallback path against drift from the MCP server's `find_backlinks`.

import assert from 'node:assert/strict';
import test from 'node:test';

function computeBacklinksLocally(slug, nodes) {
  const out = [];
  const tail = slug.includes('/') ? slug.split('/').pop() ?? slug : slug;
  for (const node of nodes) {
    if (node.slug === slug) continue;
    const matchedKeys = [];
    if (node.domain && (node.domain === slug || node.domain === tail)) {
      matchedKeys.push('domain');
    }
    for (const key of ['capabilities', 'elements']) {
      const arr = node[key];
      if (!arr) continue;
      if (arr.includes(slug) || arr.includes(tail)) {
        matchedKeys.push(key);
      }
    }
    if (matchedKeys.length > 0) {
      out.push({
        slug: node.slug,
        kind: node.kind,
        title: node.title,
        filePath: node.filePath,
        matchedKeys,
      });
    }
  }
  return out;
}

const NODES = [
  {
    slug: 'capabilities/mcp-server',
    kind: 'capability',
    title: 'MCP Server',
    filePath: '/x.md',
  },
  {
    slug: 'domains/ai-agent-partner',
    kind: 'domain',
    title: 'AI Agent Partner',
    filePath: '/y.md',
    capabilities: ['mcp-server', 'mcp-conflict-guard'], // tail-only refs
  },
  {
    slug: 'capabilities/cli-developer-entry',
    kind: 'capability',
    title: 'CLI',
    filePath: '/z.md',
    capabilities: ['capabilities/mcp-server'], // full-form ref (would normally be in `relates`)
  },
  {
    slug: 'capabilities/mcp-conflict-guard',
    kind: 'capability',
    title: 'Conflict Guard',
    filePath: '/w.md',
    domain: 'ai-agent-partner', // tail-only domain ref
  },
];

test('tail-only reference 매치 (mcp-server in capabilities[])', () => {
  const links = computeBacklinksLocally('capabilities/mcp-server', NODES);
  const slugs = links.map((l) => l.slug).sort();
  assert.deepEqual(slugs, [
    'capabilities/cli-developer-entry',
    'domains/ai-agent-partner',
  ]);
});

test('domain inline-string 매치 (tail-only)', () => {
  const links = computeBacklinksLocally('domains/ai-agent-partner', NODES);
  const targets = links.find(
    (l) => l.slug === 'capabilities/mcp-conflict-guard',
  );
  assert.ok(targets, 'mcp-conflict-guard should match via domain key');
  assert.deepEqual(targets?.matchedKeys, ['domain']);
});

test('자기 자신은 제외', () => {
  const links = computeBacklinksLocally('capabilities/mcp-server', NODES);
  assert.ok(!links.some((l) => l.slug === 'capabilities/mcp-server'));
});

test('매치 없으면 빈 array', () => {
  const links = computeBacklinksLocally('capabilities/nonexistent', NODES);
  assert.equal(links.length, 0);
});

test('matchedKeys 가 multiple key 일 수 있음', () => {
  const nodes = [
    {
      slug: 'capabilities/foo',
      kind: 'capability',
      title: 'Foo',
      filePath: '/a.md',
      capabilities: ['target'],
      elements: ['target'],
    },
    {
      slug: 'target',
      kind: 'element',
      title: 'Target',
      filePath: '/t.md',
    },
  ];
  const links = computeBacklinksLocally('target', nodes);
  assert.equal(links.length, 1);
  assert.deepEqual(links[0].matchedKeys.sort(), ['capabilities', 'elements']);
});
