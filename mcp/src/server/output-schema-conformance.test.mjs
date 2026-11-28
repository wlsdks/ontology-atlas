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
import { advertisedOutputSchema } from './advertised-output-schema.mjs';
import { answerModeOf } from './tool-answer-modes.mjs';
import { TOOL_OUTPUT_CONTRACT_BY_NAME } from './registry.mjs';

const HOST_VALIDATOR = new AjvJsonSchemaValidator();
const SERVER_ENTRY = join(dirname(fileURLToPath(import.meta.url)), '..', 'javascript-server.mjs');

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
  const advertised = new Map(responses.find((response) => response.id === 1).result.tools.map((tool) => [tool.name, tool.outputSchema]));
  return calls.map(([name, args], index) => {
    const result = responses.find((response) => response.id === index + 2)?.result;
    assert.ok(result?.structuredContent, `${name} ${JSON.stringify(args)} answered without structuredContent`);
    assert.notEqual(result.isError, true, `${name} ${JSON.stringify(args)} refused: ${result.content?.[0]?.text}`);
    const contract = TOOL_OUTPUT_CONTRACT_BY_NAME.get(name);
    assert.ok(contract, `${name} defines no output contract`);
    assert.ok(advertised.get(name), `${name} advertises no outputSchema`);
    const errors = schemaErrors(contract, result.structuredContent);
    // A tool with two kinds of answer is also held to the schema of the kind this call asked for,
    // which the union above cannot tell apart.
    const asked = answerModeOf(name, args);
    if (asked) {
      errors.push(...schemaErrors(asked.schema, result.structuredContent).map((error) => `${asked.mode} answer: ${error}`));
    }
    // The validator an MCP SDK client runs on structuredContent, against the
    // full contract and against the schema tools/list advertises.
    for (const [label, schema] of [['contract', contract], ['advertised', advertised.get(name)]]) {
      const host = HOST_VALIDATOR.getValidator(schema)(result.structuredContent);
      if (!host.valid) errors.push(`host validator on the ${label} schema: ${host.errorMessage}`);
    }
    return { name, args, mode: asked?.mode ?? null, answer: result.structuredContent, schemaError: errors.length === 0 ? null : errors.slice(0, 5).join('; ') };
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
    writeVaultFile(vault, 'capabilities/other', '---\nuid: 00000000-0000-4000-8000-000000000005\nkind: capability\ntitle: Other\n---\nThe other.\n');

    const answers = await answersAgainstDeclaredSchemas(vault, [
      ['remove_relation', { from: 'capabilities/caller', to: 'capabilities/target', type: 'relates', confirm: true }],
      ['remove_relation', { from: 'capabilities/caller', to: 'capabilities/target', type: 'depends_on', replaceWith: { to: 'capabilities/spare', type: 'depends_on', why: 'The caller waits on the spare now.' }, confirm: true }],
      ['rename_concept', { oldSlug: 'capabilities/other', newKind: 'element', domain: 'domains/core', confirm: true }],
      ['rename_concept', { oldSlug: 'capabilities/spare', newSlug: 'capabilities/extra', confirm: true }],
    ]);

    assert.deepEqual(answers.filter((answer) => answer.schemaError).map(({ name, schemaError }) => ({ name, schemaError })), []);
    assert.deepEqual(answers.map(({ name, mode }) => `${name}:${mode}`), ['remove_relation:remove', 'remove_relation:replace', 'rename_concept:reclassify', 'rename_concept:rename']);
    for (const { name, answer } of answers) {
      assert.equal(answer.changed, true, `${name} wrote`);
      assert.deepEqual(Object.keys(answer.postWriteMaintenance ?? {}), ['nextAction', 'stepsAboutTouched'], `${name} answers with the next step`);
    }
  } finally {
    rmSync(vault, { recursive: true, force: true });
  }
});

test('a construction pass of reads and writes matches the contract and the advertised schema', async () => {
  const vault = mkdtempSync(join(tmpdir(), 'atlas-construction-schema-'));
  try {
    writeVaultFile(vault, 'project', '---\nuid: 00000000-0000-4000-8000-000000000001\nkind: project\ntitle: Project\n---\nThe project.\n');
    writeVaultFile(vault, 'domains/core', '---\nuid: 00000000-0000-4000-8000-000000000002\nkind: domain\ntitle: Core\n---\nThe core.\n');
    writeVaultFile(vault, 'capabilities/target', '---\nuid: 00000000-0000-4000-8000-000000000003\nkind: capability\ntitle: Target\ndomain: domains/core\n---\nThe target.\n');
    writeVaultFile(vault, 'capabilities/caller', '---\nuid: 00000000-0000-4000-8000-000000000004\nkind: capability\ntitle: Caller\ndomain: domains/core\ndepends_on: [capabilities/target]\n---\nThe caller.\n');

    const answers = await answersAgainstDeclaredSchemas(vault, [
      ['list_concepts', { limit: 1 }],
      ['list_concepts', {}],
      ['get_concepts', { slugs: ['capabilities/caller'], body: 'full' }],
      ['get_concepts', { slugs: ['capabilities/caller', 'capabilities/missing'] }],
      ['list_concepts', { mentions: 'target' }],
      ['list_concepts', { mentions: 'no node says this' }],
      ['query_ontology', { operation: 'neighbors', slug: 'capabilities/caller' }],
      ['query_ontology', { operation: 'path', from: 'capabilities/caller', to: 'domains/core' }],
      ['query_ontology', { operation: 'match_nodes', hasIncoming: false }],
      ['list_concepts', { filter: 'kind=capability' }],
      ['list_concepts', { filter: 'kind=document' }],
      ['get_constellation', {}],
      ['compile_ontology', {}],
      ['query_ontology', { operation: 'impact', slug: 'capabilities/target' }],
      ['validate_vault', {}],
      ['add_concepts', { concepts: [{ slug: 'capabilities/reader', kind: 'capability', title: 'Reader', domain: 'domains/core', body: 'Reads the target.' }] }],
      ['add_relations', { relations: [{ from: 'capabilities/reader', to: 'capabilities/target', type: 'depends_on', why: 'Reading calls the target first.' }] }],
      ['patch_concept', { slug: 'capabilities/reader', body: 'Reads the target, then reports.' }],
      ['validate_vault', {}],
    ]);

    assert.deepEqual(answers.filter((answer) => answer.schemaError).map(({ name, schemaError }) => ({ name, schemaError })), []);
  } finally {
    rmSync(vault, { recursive: true, force: true });
  }
});

test('the advertised cut accepts every value its contract accepts, under an SDK client validator', () => {
  const row = {
    type: 'object',
    properties: { id: { type: 'string', pattern: '^r-' }, tags: { type: 'array', items: { type: 'string', enum: ['a'] } } },
    required: ['id'],
    additionalProperties: false,
  };
  const contract = {
    type: 'object',
    properties: {
      state: { type: 'string', enum: ['ready', 'blocked'] },
      score: { anyOf: [{ type: 'integer', minimum: 0 }, { type: 'number' }] },
      next: { anyOf: [row, { type: 'null' }] },
      mode: { const: 'summary' },
      rows: { type: 'array', maxItems: 2, items: row },
      canConfirm: { type: 'boolean', description: 'True only when confirm:true can perform the change.' },
      note: { type: 'string', description: 'A long description the agent does not need.' },
    },
    required: ['state', 'rows'],
    oneOf: [{ required: ['score'] }, { required: ['next'] }],
    additionalProperties: false,
  };
  const advertised = advertisedOutputSchema(contract);
  assert.deepEqual(advertised.properties, {
    state: { type: 'string' },
    score: { type: 'number' },
    next: { type: ['object', 'null'] },
    mode: { type: 'string' },
    rows: { type: 'array' },
    canConfirm: { type: 'boolean', description: 'True only when confirm:true can perform the change.' },
    note: { type: 'string' },
  });

  const checkContract = HOST_VALIDATOR.getValidator(contract);
  const checkAdvertised = HOST_VALIDATOR.getValidator(advertised);
  const valid = [
    { state: 'ready', rows: [], score: 1 },
    { state: 'blocked', rows: [{ id: 'r-1', tags: ['a'] }], score: 0.5, mode: 'summary', canConfirm: true },
    { state: 'ready', rows: [{ id: 'r-2' }], next: { id: 'r-3' }, note: 'x' },
    { state: 'ready', rows: [], next: null },
  ];
  for (const value of valid) {
    assert.ok(checkContract(value).valid, `the contract accepts ${JSON.stringify(value)}`);
    assert.ok(checkAdvertised(value).valid, `the advertised cut accepts ${JSON.stringify(value)}`);
  }
  for (const value of [{ rows: [] }, { state: 'ready', rows: {} }, { state: 'ready', rows: [], extra: 1 }]) {
    assert.equal(checkAdvertised(value).valid, false, `the advertised cut still refuses ${JSON.stringify(value)}`);
  }
});
