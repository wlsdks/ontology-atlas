/*
 * The family line as the server returns it: through `analyze_repo_structure`,
 * declared by its output schema, and counted only inside the folder the server
 * was granted, even when that folder sits inside a larger repository.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { runJsonRpcProcess } from '../../../scripts/lib/mcp-test-rpc.mjs';
import { schemaErrors } from '../../../scripts/lib/output-schema-errors.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const serverEntry = process.env.OATLAS_TEST_SERVER_ENTRY ?? join(here, '..', 'index.js');

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

/** The structured answers of one server opened for `granted`, plus the tool's output schema. */
async function answers(granted, vault, calls) {
  const { responses } = await runJsonRpcProcess({
    command: process.execPath, args: [serverEntry], timeoutMs: 30_000,
    env: { ...process.env, OATLAS_VAULT: vault, OATLAS_REPO_ROOT: granted },
    requests: [
      { jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'read-family-door-test', version: '1' } } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
      ...calls.map((args, index) => ({ jsonrpc: '2.0', id: index + 2, method: 'tools/call', params: { name: 'analyze_repo_structure', arguments: args } })),
    ],
  });
  const schema = responses.find(({ id }) => id === 1).result.tools.find((tool) => tool.name === 'analyze_repo_structure').outputSchema;
  return { schema, results: calls.map((_, index) => responses.find(({ id }) => id === index + 2).result) };
}

test('a family is counted only inside the folder the server was granted, never in a folder above it', async () => {
  const root = repository();
  try {
    const granted = join(root, 'granted');
    const vault = join(granted, 'atlas');
    mkdirSync(vault, { recursive: true });
    const slack = { sourceOnly: true, sourceReads: [{ path: 'src/slack.ts', symbol: 'Slack.apply' }] };
    const inside = await answers(granted, vault, [slack, { ...slack, rootPath: join(root, 'private') }]);
    const [atFolder, outside] = inside.results;
    assert.deepEqual(schemaErrors(inside.schema, atFolder.structuredContent), []);
    const family = atFolder.structuredContent.sourceEvidence.rows[0].family;
    assert.match(family, /^This family has at least 2 members found in this folder: the classes whose header names `Plugin` \(src\/plugin\.ts:L1\) \(Mail src\/mail\.ts:L2, Slack src\/slack\.ts:L2\)\. You read 1 of them; a sentence about the family says "1 of at least 2 read"/);
    assert.doesNotMatch(family, /plan\.ts|UnannouncedBridge|private/, 'a file above the granted folder never reaches the line');
    assert.equal(outside.isError, true, 'a read addressed to a sibling folder is refused');

    mkdirSync(join(root, 'atlas'));
    const whole = await answers(root, join(root, 'atlas'), [{ sourceOnly: true, sourceReads: [{ path: 'granted/src/slack.ts', symbol: 'Slack.apply' }] }]);
    const repositoryFamily = whole.results[0].structuredContent.sourceEvidence.rows[0].family;
    assert.deepEqual(schemaErrors(whole.schema, whole.results[0].structuredContent), []);
    assert.match(repositoryFamily, /^This family has at least 3 members found in this folder: the classes whose header names `Plugin` \(granted\/src\/plugin\.ts:L1\) \(Mail granted\/src\/mail\.ts:L2, Slack granted\/src\/slack\.ts:L2, UnannouncedBridge private\/notes\/plan\.ts:L2\)\./,
      'a server granted the repository root counts the whole repository');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
