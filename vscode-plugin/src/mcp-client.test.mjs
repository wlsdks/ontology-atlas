// Integration test for McpClient — actually spawns mcp/src/index.js
// against a tmp vault, calls find_backlinks, verifies the response shape.
//
// Mirrors the spawn-based pattern used in `mcp/src/integration.test.mjs`.

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpClient } from '../out/mcp-client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = resolve(__dirname, '../../mcp/src/index.js');

function withVault(seed) {
  const root = mkdtempSync(join(tmpdir(), 'omot-vscode-mcp-'));
  for (const { slug, content } of seed) {
    writeFileSync(join(root, `${slug}.md`), content, 'utf-8');
  }
  return root;
}

test('McpClient — start + callTool find_backlinks + dispose', async () => {
  const root = withVault([
    { slug: 'a', content: '---\nslug: a\nkind: capability\ntitle: A\n---\n' },
    {
      slug: 'b',
      content:
        '---\nslug: b\nkind: capability\ntitle: B\nrelates:\n  - a\n---\n',
    },
  ]);
  const client = new McpClient(SERVER_ENTRY, root);
  try {
    await client.start(8000);
    const result = await client.callTool('find_backlinks', { slug: 'a' });
    assert.equal(typeof result.total, 'number');
    assert.equal(result.total, 1);
    assert.equal(result.matches[0].slug, 'b');
  } finally {
    client.dispose();
    rmSync(root, { recursive: true, force: true });
  }
});

test('McpClient — error response throws on bad tool args', async () => {
  const root = withVault([
    { slug: 'a', content: '---\nslug: a\nkind: capability\ntitle: A\n---\n' },
  ]);
  const client = new McpClient(SERVER_ENTRY, root);
  try {
    await client.start(8000);
    await assert.rejects(
      () => client.callTool('get_concept', { slug: 'nonexistent-slug-xyz' }),
      /not found|nonexistent/i,
    );
  } finally {
    client.dispose();
    rmSync(root, { recursive: true, force: true });
  }
});

test('McpClient — dispose is idempotent', async () => {
  const root = withVault([]);
  const client = new McpClient(SERVER_ENTRY, root);
  client.dispose();
  client.dispose(); // should not throw
  rmSync(root, { recursive: true, force: true });
});
