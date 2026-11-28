/*
 * A source-only read through `analyze_repo_structure`: text alone, no family
 * line, and bounded to the folder the server was granted, even when that
 * folder sits inside a larger repository.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { runJsonRpcProcess } from '../../../scripts/lib/mcp-test-rpc.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const serverEntry = process.env.OATLAS_TEST_SERVER_ENTRY ?? join(here, '..', 'javascript-server.mjs');

const plugin = (name, from) => `import { Plugin } from '${from}';\nexport class ${name} implements Plugin {\n  apply(token: string) {\n    if (!token) throw new Error('${name}: no token');\n    return true;\n  }\n}\n`;

/** A repository whose `granted/` folder holds a plugin family; a sibling folder outside it holds one more member. */
function repository() {
  const root = mkdtempSync(join(tmpdir(), 'atlas-read-family-door-'));
  const files = {
    'README.md': '# Release\n',
    'package.json': '{"name":"release","private":true}',
    'granted/package.json': '{"name":"tool"}',
    'granted/src/plugin.ts': 'export interface Plugin {\n  apply(token: string): boolean;\n}\n',
    'granted/src/slack.ts': plugin('Slack', './plugin'),
    'granted/src/mail.ts': plugin('Mail', './plugin'),
    'private/notes/plan.ts': plugin('UnannouncedBridge', '../../granted/src/plugin'),
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Atlas Test', '-c', 'user.email=atlas@example.invalid', 'commit', '-q', '-m', 'fixture'], { cwd: root });
  return root;
}

/** The answers of one server opened for `granted`. */
async function answers(granted, vault, calls) {
  const { responses } = await runJsonRpcProcess({
    command: process.execPath, args: [serverEntry], timeoutMs: 30_000,
    env: { ...process.env, OATLAS_VAULT: vault, OATLAS_REPO_ROOT: granted },
    requests: [
      { jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'read-family-door-test', version: '1' } } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      ...calls.map((args, index) => ({ jsonrpc: '2.0', id: index + 2, method: 'tools/call', params: { name: 'analyze_repo_structure', arguments: args } })),
    ],
  });
  return calls.map((_, index) => responses.find(({ id }) => id === index + 2).result);
}

/** The text a read answers with. */
function readText(result) {
  assert.equal(result.structuredContent, undefined, 'the reads travel as text alone');
  return result.content[0].text;
}

test('a source read stays inside the folder the server was granted and carries no family line', async () => {
  const root = repository();
  try {
    const granted = join(root, 'granted');
    const vault = join(granted, 'atlas');
    mkdirSync(vault, { recursive: true });
    const slack = { sourceOnly: true, sourceReads: [{ path: 'src/slack.ts', symbol: 'Slack.apply' }] };
    const [atFolder, outside] = await answers(granted, vault, [slack, { ...slack, rootPath: join(root, 'private') }]);
    const text = readText(atFolder);
    assert.match(text, /== read src\/slack\.ts Slack\.apply L3-L7 of 7 lines/);
    assert.doesNotMatch(text, /^Family: /m, 'the family line is no longer part of a read');
    assert.doesNotMatch(text, /plan\.ts|UnannouncedBridge|private/, 'a file above the granted folder never reaches the answer');
    assert.equal(outside.isError, true, 'a read addressed to a sibling folder is refused');
    assert.match(outside.content[0].text, /This server only reads the folder it was opened for/);

    mkdirSync(join(root, 'atlas'));
    const [whole] = await answers(root, join(root, 'atlas'), [{ sourceOnly: true, sourceReads: [{ path: 'granted/src/slack.ts', symbol: 'Slack.apply' }] }]);
    assert.match(readText(whole), /== read granted\/src\/slack\.ts Slack\.apply/, 'a server granted the repository root reads inside the whole repository');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
