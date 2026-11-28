import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { once } from 'node:events';
import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  resolveStaticExportFile,
  startStaticExportServer,
} from './serve-built-folder.mjs';

describe('serve-built-folder security boundary', () => {
  const roots = [];

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function fixture() {
    const parent = realpathSync(mkdtempSync(path.join(tmpdir(), 'ontology-atlas-static-test-')));
    roots.push(parent);
    const root = path.join(parent, 'out');
    mkdirSync(root);
    writeFileSync(path.join(root, 'index.html'), 'inside', 'utf-8');
    return { parent, root };
  }

  it('serves regular files inside the selected export root', async () => {
    const { root } = fixture();
    assert.equal(await resolveStaticExportFile(root, '/'), path.join(root, 'index.html'));
  });

  it('rejects sibling-prefix traversal and symlinks that resolve outside the root', async () => {
    const { parent, root } = fixture();
    const sibling = path.join(parent, 'outside.html');
    writeFileSync(sibling, 'outside', 'utf-8');
    symlinkSync(sibling, path.join(root, 'linked.html'));

    assert.equal(await resolveStaticExportFile(root, '/../outside.html'), null);
    assert.equal(await resolveStaticExportFile(root, '/linked.html'), null);
  });

  it('answers a missing path with the fallback document and status 200 only when asked, else 404.html', async () => {
    const { root } = fixture();
    writeFileSync(path.join(root, '404.html'), 'not found page', 'utf-8');
    const answers = async (fallback) => {
      const server = startStaticExportServer({ root, port: 0, fallback });
      try {
        await once(server, 'listening');
        const response = await fetch(`http://127.0.0.1:${server.address().port}/ko/topology/`);
        return [response.status, await response.text()];
      } finally {
        server.close();
        await once(server, 'close');
      }
    };
    assert.deepEqual(await answers(null), [404, 'not found page']);
    assert.deepEqual(await answers('index.html'), [200, 'inside']);
  });

  it('binds the helper server to loopback by default', async () => {
    const { root } = fixture();
    const server = startStaticExportServer({ root, port: 0 });
    try {
      await once(server, 'listening');
      const address = server.address();
      assert.equal(typeof address, 'object');
      assert.equal(address.address, '127.0.0.1');
    } finally {
      server.close();
      await once(server, 'close');
    }
  });
});
