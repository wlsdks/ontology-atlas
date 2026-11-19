/*
 * Through the server: a read that returns less than a whole declaration says
 * where it ends and hands back the exact call for the rest, and a sentence a
 * write states for a whole family comes back quoted with the family's count.
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

const plugin = (name) => `import { Plugin } from './plugin';\n\nexport class ${name} implements Plugin {\n  apply(token: string) {\n    if (!token) throw new Error('${name}: no token');\n    return true;\n  }\n}\n`;
const longBody = Array.from({ length: 90 }, (_, at) => `  if (options.flag${at}) steps.push('step ${at}');`).join('\n');

function repository() {
  const root = mkdtempSync(join(tmpdir(), 'atlas-partial-serve-'));
  const files = {
    'package.json': '{"name":"release","private":true}',
    'src/plugin.ts': 'export interface Plugin {\n  apply(token: string): boolean;\n}\n',
    'src/slack.ts': plugin('Slack'),
    'src/mail.ts': plugin('Mail'),
    'src/teams.ts': plugin('Teams'),
    'src/notify.ts': 'export function notify(message) {\n  return message.trim();\n}\n',
    ...Object.fromEntries(['first', 'second', 'third'].map((name) => [`src/${name}.ts`, `import { notify } from './notify';\n\nexport function ${name}(message) {\n  if (message) notify(message);\n}\n`])),
    'src/batch.ts': `import { release } from './plan';\n\nexport function releaseAll(list) {\n${Array.from({ length: 50 }, (_, at) => `  const step${at} = list[${at}];`).join('\n')}\n  if (list.length) release(list[0]);\n  return list;\n}\n`,
    'src/plan.ts': `export function plan(options) {\n  const steps = [];\n${longBody}\n  return steps;\n}\n\nexport function release(options) {\n  if (!options.ready) return null;\n  return plan(options);\n}\n`,
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Atlas Test', '-c', 'user.email=atlas@example.invalid', 'commit', '-q', '-m', 'fixture'], { cwd: root });
  mkdirSync(join(root, 'atlas'));
  return root;
}

/** One server session: each `[tool, arguments]` in order, with every tool's output schema. */
async function session(root, calls) {
  const { responses } = await runJsonRpcProcess({
    command: process.execPath, args: [serverEntry], timeoutMs: 30_000,
    env: { ...process.env, OATLAS_VAULT: join(root, 'atlas'), OATLAS_REPO_ROOT: root },
    requests: [
      { jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'partial-serve-test', version: '1' } } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
      ...calls.map(([name, args], index) => ({ jsonrpc: '2.0', id: index + 2, method: 'tools/call', params: { name, arguments: args } })),
    ],
  });
  const tools = responses.find(({ id }) => id === 1).result.tools;
  return calls.map(([name], index) => {
    const result = responses.find(({ id }) => id === index + 2).result;
    assert.notEqual(result.isError, true, `${name}: ${JSON.stringify(result.content)}`);
    assert.deepEqual(schemaErrors(tools.find((tool) => tool.name === name).outputSchema, result.structuredContent), [], name);
    return result.structuredContent;
  });
}

test('a read cut short of its declaration says where it ends, and its nextCall returns the rest', async () => {
  const root = repository();
  try {
    const [cut] = await session(root, [['analyze_repo_structure', { sourceOnly: true, ignore: ['atlas'], sourceReads: [{ path: 'src/plan.ts', symbol: 'plan', maxLines: 30 }] }]]);
    const row = cut.sourceEvidence.rows[0];
    assert.deepEqual(row.actualRange, { startLine: 1, endLine: 30 });
    assert.match(row.continues, /^plan continues to line 94 \(it runs L1-L94\); this returned L1-L30, unread: L31-L94\. nextCall returns L31-L94\.$/);
    assert.equal(row.nextCall.tool, 'analyze_repo_structure');
    assert.deepEqual(row.nextCall.arguments.ignore, ['atlas'], 'the follow-up repeats the call\'s ignores');
    const [rest] = await session(root, [[row.nextCall.tool, row.nextCall.arguments]]);
    assert.deepEqual(rest.sourceEvidence.rows[0].actualRange, { startLine: 31, endLine: 94 });
    assert.equal(rest.sourceEvidence.rows[0].continues, undefined, 'nothing of the declaration is left');

    const [part] = await session(root, [['analyze_repo_structure', { sourceOnly: true, sourceReads: [{ path: 'src/plan.ts', symbol: 'release' }] }]]);
    const callee = part.sourceEvidence.rows[0].context.find((candidate) => candidate.symbol === 'plan');
    assert.deepEqual([callee.startLine, callee.endLine], [1, 60], 'a context part is cut at 60 lines');
    assert.match(callee.continues, /^plan continues to line 94 .*unread: L61-L94\./);
    assert.deepEqual(callee.nextCall.arguments.sourceReads, [{ path: 'src/plan.ts', startLine: 61, maxLines: 34, expectedSha256: part.sourceEvidence.rows[0].fullFileSha256 }]);
    assert.equal(part.sourceEvidence.rows[0].continues, undefined, 'a whole body owes nothing');
    const window = part.sourceEvidence.rows[0].context.find((candidate) => candidate.role === 'caller' && candidate.symbol === 'releaseAll');
    assert.ok(window.startLine === 3 && window.endLine < 56, `a guard window of the caller: ${window.cite}`);
    assert.match(window.continues, /^releaseAll continues to line 56 \(it runs L3-L56\); this returned L3-L\d+, unread: L\d+-L56\./);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a deciding note carries the call that reads its caller, until the session has read that caller', async () => {
  const root = repository();
  try {
    const notify = { sourceOnly: true, sourceReads: [{ path: 'src/notify.ts', symbol: 'notify' }] };
    const [first] = await session(root, [['analyze_repo_structure', notify]]);
    const row = first.sourceEvidence.rows[0];
    assert.match(row.deciding, /deciding condition is in its callers first \(src\/first\.ts:L4\)/);
    assert.deepEqual(row.decidingNextCall.arguments.sourceReads, [{ path: 'src/first.ts', startLine: 3, maxLines: 3, expectedSha256: row.decidingNextCall.arguments.sourceReads[0].expectedSha256 }]);
    const [caller, again] = await session(root, [[row.decidingNextCall.tool, row.decidingNextCall.arguments], ['analyze_repo_structure', notify]]);
    assert.match(caller.sourceEvidence.rows[0].text, /if \(message\) notify\(message\);/);
    assert.match(again.sourceEvidence.rows[0].deciding, /deciding condition/, 'the note stays');
    assert.equal(again.sourceEvidence.rows[0].decidingNextCall, undefined, 'its call goes once the caller was read');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a write that speaks for a whole family read in part gets the sentence back with the count; nothing is refused', async () => {
  const root = repository();
  try {
    const readSlack = ['analyze_repo_structure', { sourceOnly: true, sourceReads: [{ path: 'src/slack.ts', symbol: 'Slack.apply' }] }];
    const body = 'Delivery through plugins.\n\nEvery plugin refuses an empty token (src/slack.ts:L4-L7).\n\n## Uncertainty\n\n- Each other plugin is unread.\n';
    const [, concepts, relations, patched] = await session(root, [
      readSlack,
      ['add_concepts', { concepts: [
        { slug: 'domains/delivery', kind: 'domain', title: 'Delivery', body },
        { slug: 'capabilities/notify', kind: 'capability', title: 'Notify', domain: 'domains/delivery', path: 'src/slack.ts', body: 'Sends a notice.\n\nSlack refuses an empty token (src/slack.ts:L4-L7).\n' },
      ] }],
      ['add_relations', { relations: [{ from: 'capabilities/notify', to: 'domains/delivery', type: 'depends_on', why: 'All plugins throw before sending when the token is empty.' }] }],
      ['patch_concept', { slug: 'capabilities/notify', body: 'Sends a notice.\n\nOnly plugins with a token send (src/mail.ts:L4-L7).\n' }],
    ]);
    const [domain, capability] = concepts.concepts;
    const quote = /^"(.+)" speaks for a whole family\. This family has at least 3 members found in this folder: the classes whose header names `Plugin` \(src\/plugin\.ts:L1\) \(Mail src\/mail\.ts:L3, Slack src\/slack\.ts:L3, Teams src\/teams\.ts:L3\); this session read 1: write "1 of at least 3 read" or name the member\.$/;
    assert.equal(domain.ok, true);
    assert.deepEqual(domain.warnings.filter((warning) => quote.test(warning)).map((warning) => quote.exec(warning)[1]),
      ['Every plugin refuses an empty token (src/slack.ts:L4-L7).'], 'the Uncertainty line is left alone');
    assert.equal((capability.warnings ?? []).some((warning) => quote.test(warning)), false, 'a sentence about the member read says nothing');
    assert.equal(relations.relations[0].ok, true);
    assert.equal(quote.exec(relations.relations[0].warnings[0])[1], 'All plugins throw before sending when the token is empty.');
    assert.equal(patched.ok, true);
    assert.equal(quote.exec(patched.warnings[0])[1], 'Only plugins with a token send (src/mail.ts:L4-L7).');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
