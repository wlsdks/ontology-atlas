import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { runJsonRpcProcess } from '../../scripts/lib/mcp-test-rpc.mjs';
import { schemaErrors } from '../../scripts/lib/output-schema-errors.mjs';
import { CONSTRUCTION_GUIDE_TOPICS } from './construction-card.mjs';

const SERVER_ENTRY = join(dirname(fileURLToPath(import.meta.url)), 'index.js');

function writeVaultFile(root, slug, text) {
  const file = join(root, `${slug}.md`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

async function answersAgainstDeclaredSchemas(vault, calls) {
  const { responses } = await runJsonRpcProcess({
    command: process.execPath,
    args: [SERVER_ENTRY],
    env: { ...process.env, OATLAS_VAULT: vault, OATLAS_REPO_ROOT: vault },
    timeoutMs: 15000,
    requests: [
      { jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'schema-conformance', version: '0' } } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
      ...calls.map(([name, args], index) => ({ jsonrpc: '2.0', id: index + 2, method: 'tools/call', params: { name, arguments: args } })),
    ],
  });
  const schemas = new Map(responses.find((response) => response.id === 1).result.tools.map((tool) => [tool.name, tool.outputSchema]));
  return calls.map(([name, args], index) => {
    const result = responses.find((response) => response.id === index + 2)?.result;
    assert.ok(result?.structuredContent, `${name} ${JSON.stringify(args)} answered without structuredContent`);
    assert.ok(schemas.get(name), `${name} declares no outputSchema`);
    const errors = schemaErrors(schemas.get(name), result.structuredContent);
    return { name, args, answer: result.structuredContent, schemaError: errors.length === 0 ? null : errors.slice(0, 5).join('; ') };
  });
}

test('backlink rows from nodes, a node without a uid, a wiki page and a plain note match their outputSchema', async () => {
  const vault = mkdtempSync(join(tmpdir(), 'atlas-backlink-schema-'));
  try {
    writeVaultFile(vault, 'capabilities/target', '---\nuid: 00000000-0000-4000-8000-000000000001\nkind: capability\ntitle: Target\n---\nThe target.\n');
    writeVaultFile(vault, 'capabilities/caller', '---\nuid: 00000000-0000-4000-8000-000000000002\nkind: capability\ntitle: Caller\ndomain: domains/core\ndepends_on: [capabilities/target]\n---\nThe caller.\n');
    writeVaultFile(vault, 'capabilities/handwritten', '---\nkind: capability\ntitle: Handwritten\nrelates: [capabilities/target]\n---\nWritten by hand, before uids.\n');
    writeVaultFile(vault, 'wiki/target-notes', '---\ntitle: Target notes\ncreated_by: human\ncompiled_at: 2026-09-28T00:00:00Z\nsources: []\nsource_hash: {}\nstatus: draft\nsummary: What the target does.\n---\nSee [[capabilities/target]].\n');
    writeVaultFile(vault, 'notes/meeting', 'We agreed to keep [the target](capabilities/target.md).\n');

    const answers = await answersAgainstDeclaredSchemas(vault, [
      ['find_backlinks', { slug: 'capabilities/target' }],
      ['delete_concept', { slug: 'capabilities/target' }],
    ]);

    assert.deepEqual(answers.filter((answer) => answer.schemaError).map(({ name, schemaError }) => ({ name, schemaError })), []);
    const [backlinks, deletePreview] = answers.map((answer) => answer.answer);
    const identities = (rows) => rows
      .map((row) => ({ slug: row.slug, isNode: row.isNode, uid: row.uid, kind: row.kind }))
      .sort((left, right) => (left.slug < right.slug ? -1 : 1));
    const expected = [
      { slug: 'capabilities/caller', isNode: true, uid: '00000000-0000-4000-8000-000000000002', kind: 'capability' },
      { slug: 'capabilities/handwritten', isNode: true, uid: undefined, kind: 'capability' },
      { slug: 'notes/meeting', isNode: false, uid: undefined, kind: undefined },
      { slug: 'wiki/target-notes', isNode: false, uid: undefined, kind: undefined },
    ];
    assert.deepEqual(identities(backlinks.matches), expected);
    assert.deepEqual(identities(deletePreview.backlinks), expected);
  } finally {
    rmSync(vault, { recursive: true, force: true });
  }
});

test('connection_info matches its outputSchema with the construction card and with every guide topic', async () => {
  const vault = mkdtempSync(join(tmpdir(), 'atlas-connection-schema-'));
  try {
    writeVaultFile(vault, 'project', '---\nuid: 00000000-0000-4000-8000-000000000001\nkind: project\ntitle: Project\n---\nThe project.\n');

    const answers = await answersAgainstDeclaredSchemas(vault, [
      ['connection_info', {}],
      ...CONSTRUCTION_GUIDE_TOPICS.map((guide) => ['connection_info', { guide }]),
    ]);

    assert.deepEqual(answers.filter((answer) => answer.schemaError).map(({ args, schemaError }) => ({ args, schemaError })), []);
  } finally {
    rmSync(vault, { recursive: true, force: true });
  }
});
