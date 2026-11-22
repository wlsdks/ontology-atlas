import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { AjvJsonSchemaValidator } from '@modelcontextprotocol/server/validators/ajv';

import { runJsonRpcProcess } from '../../../scripts/lib/mcp-test-rpc.mjs';
import { schemaErrors } from '../../../scripts/lib/output-schema-errors.mjs';
import { CONSTRUCTION_GUIDE_TOPICS } from '../construction/construction-card.mjs';
import { hoistSharedSubschemas, inlineSharedSubschemas } from './shared-subschemas.mjs';

const HOST_VALIDATOR = new AjvJsonSchemaValidator();
const SERVER_ENTRY = join(dirname(fileURLToPath(import.meta.url)), '..', 'index.js');

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
    // The validator an MCP SDK client runs on structuredContent, `$ref`s and all.
    const host = HOST_VALIDATOR.getValidator(schemas.get(name))(result.structuredContent);
    if (!host.valid) errors.push(`host validator: ${host.errorMessage}`);
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

test('confirmed writes answer with a post-write maintenance summary that matches their outputSchema', async () => {
  const vault = mkdtempSync(join(tmpdir(), 'atlas-write-schema-'));
  try {
    writeVaultFile(vault, 'domains/core', '---\nuid: 00000000-0000-4000-8000-000000000001\nkind: domain\ntitle: Core\n---\nThe core.\n');
    writeVaultFile(vault, 'capabilities/target', '---\nuid: 00000000-0000-4000-8000-000000000002\nkind: capability\ntitle: Target\n---\nThe target.\n');
    writeVaultFile(vault, 'capabilities/caller', '---\nuid: 00000000-0000-4000-8000-000000000003\nkind: capability\ntitle: Caller\ndomain: domains/core\ndepends_on: [capabilities/target]\nrelates: [capabilities/target]\n---\nThe caller.\n');
    writeVaultFile(vault, 'capabilities/spare', '---\nuid: 00000000-0000-4000-8000-000000000004\nkind: capability\ntitle: Spare\n---\nThe spare.\n');

    const answers = await answersAgainstDeclaredSchemas(vault, [
      ['remove_relation', { from: 'capabilities/caller', to: 'capabilities/target', type: 'relates', confirm: true }],
      ['rename_concept', { oldSlug: 'capabilities/spare', newSlug: 'capabilities/extra', confirm: true }],
    ]);

    assert.deepEqual(answers.filter((answer) => answer.schemaError).map(({ name, schemaError }) => ({ name, schemaError })), []);
    for (const { name, answer } of answers) {
      assert.equal(answer.changed, true, `${name} wrote`);
      assert.equal(answer.postWriteMaintenance?.operation, 'maintenance_plan', `${name} answers with the maintenance summary`);
      assert.ok(answer.postWriteMaintenance.actions.length > 0, `${name} maintenance summary lists actions`);
    }
  } finally {
    rmSync(vault, { recursive: true, force: true });
  }
});

test('a hoisted schema accepts and rejects the same values as the inline one under an SDK client validator', () => {
  const action = {
    type: 'object',
    properties: { id: { type: 'string', minLength: 1 }, score: { type: 'number', minimum: 0 } },
    required: ['id', 'score'],
    additionalProperties: false,
  };
  const inline = {
    type: 'object',
    properties: { next: { ...action, type: ['object', 'null'] }, first: action, actions: { type: 'array', items: action } },
    required: ['first', 'actions'],
    additionalProperties: false,
  };
  const hoisted = hoistSharedSubschemas(inline);
  assert.ok(hoisted.$defs, 'the repeated action shape is written once');
  assert.ok(JSON.stringify(hoisted).length < JSON.stringify(inline).length);
  assert.deepEqual(inlineSharedSubschemas(hoisted), inline);

  const checkInline = HOST_VALIDATOR.getValidator(inline);
  const checkHoisted = HOST_VALIDATOR.getValidator(hoisted);
  const values = [
    { first: { id: 'a', score: 1 }, actions: [{ id: 'b', score: 0 }], next: null },
    { first: { id: 'a', score: 1 }, actions: [{ id: 'b', score: -1 }] },
    { first: { id: '', score: 1 }, actions: [] },
    { first: { id: 'a', score: 1, extra: true }, actions: [] },
    { first: { id: 'a', score: 1 }, actions: [{ id: 'b' }] },
    { first: { id: 'a', score: 1 }, actions: [], next: { id: 'c', score: 2 } },
  ];
  assert.deepEqual(
    values.map((value) => checkHoisted(value).valid),
    values.map((value) => checkInline(value).valid),
  );
  assert.deepEqual(values.map((value) => checkHoisted(value).valid), [true, false, false, false, false, true]);
});
