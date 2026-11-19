/*
 * The family line as the server returns it: through `analyze_repo_structure`,
 * declared by its output schema, and counted across the repository root even
 * when the read is made with `rootPath` at one package.
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

const plugin = (name) => `import { Plugin } from '../../core/src/plugin';\nexport class ${name} implements Plugin {\n  apply(token: string) {\n    if (!token) throw new Error('${name}: no token');\n    return true;\n  }\n}\n`;

function repository() {
  const root = mkdtempSync(join(tmpdir(), 'atlas-read-family-door-'));
  const files = {
    'README.md': '# Release\n',
    'package.json': '{"name":"release","private":true,"workspaces":["packages/*"]}',
    'packages/core/package.json': '{"name":"core"}',
    'packages/core/src/plugin.ts': 'export interface Plugin {\n  apply(token: string): boolean;\n}\n',
    'packages/slack/package.json': '{"name":"slack"}',
    'packages/slack/src/slack.ts': plugin('Slack'),
    'packages/mail/package.json': '{"name":"mail"}',
    'packages/mail/src/mail.ts': plugin('Mail'),
    'packages/sms/package.json': '{"name":"sms"}',
    'packages/sms/src/sms.ts': plugin('Sms'),
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

test('a symbol read through the server carries its family, schema-valid, counted across the repository root', async () => {
  const root = repository();
  try {
    const vault = join(root, 'atlas');
    mkdirSync(vault, { recursive: true });
    const calls = [
      { sourceOnly: true, sourceReads: [{ path: 'packages/slack/src/slack.ts', symbol: 'Slack.apply' }] },
      { sourceOnly: true, rootPath: join(root, 'packages', 'mail'), sourceReads: [{ path: 'src/mail.ts', symbol: 'Mail.apply' }] },
    ];
    const { responses } = await runJsonRpcProcess({
      command: process.execPath, args: [serverEntry], timeoutMs: 30_000,
      env: { ...process.env, OATLAS_VAULT: vault, OATLAS_REPO_ROOT: root },
      requests: [
        { jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'read-family-door-test', version: '1' } } },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
        ...calls.map((args, index) => ({ jsonrpc: '2.0', id: index + 2, method: 'tools/call', params: { name: 'analyze_repo_structure', arguments: args } })),
      ],
    });
    const schema = responses.find(({ id }) => id === 1).result.tools.find((tool) => tool.name === 'analyze_repo_structure').outputSchema;
    const [atRoot, atPackage] = calls.map((_, index) => responses.find(({ id }) => id === index + 2).result.structuredContent);
    for (const answer of [atRoot, atPackage]) assert.deepEqual(schemaErrors(schema, answer), []);
    assert.match(atRoot.sourceEvidence.rows[0].family, /^This family has 3 members: the classes whose header names `Plugin` \(packages\/core\/src\/plugin\.ts:L1\) \(Mail packages\/mail\/src\/mail\.ts:L2, Slack packages\/slack\/src\/slack\.ts:L2, Sms packages\/sms\/src\/sms\.ts:L2\)\. This session has read 1 of them/);
    assert.match(atPackage.sourceEvidence.rows[0].family, /^This family has 3 members: the classes whose header names `Plugin` \(\.\.\/core\/src\/plugin\.ts:L1\) \(Mail src\/mail\.ts:L2, Slack \.\.\/slack\/src\/slack\.ts:L2, Sms \.\.\/sms\/src\/sms\.ts:L2\)\. This session has read 2 of them/,
      'a read at one package counts the members across the repository root and the reads made at the root');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
