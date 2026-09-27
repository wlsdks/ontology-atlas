import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { TOOLS_FOR_LIST } from './server/registry.mjs';
import { RESPONSE_TEXT_BUDGET_BYTES, ok } from './server/rpc.mjs';

const SCHEMA_KEYWORDS = new Set([
  'type', 'description', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const',
  'minimum', 'maximum', 'minLength', 'maxLength', 'pattern', 'format', 'minItems', 'maxItems',
  'uniqueItems', 'minProperties', 'propertyNames', 'oneOf', 'anyOf', 'allOf', 'not', 'if', 'then',
]);

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

/**
 * The keywords the tool output schemas use, checked as an MCP client checks
 * `structuredContent`; any other keyword fails, so a schema cannot pass by being
 * misunderstood.
 */
function schemaErrors(schema, value, path = '$') {
  if (schema === true || schema === undefined) return [];
  if (schema === false) return [`${path}: not allowed`];
  for (const key of Object.keys(schema)) {
    if (!SCHEMA_KEYWORDS.has(key)) return [`${path}: unchecked keyword ${key}`];
  }
  const errors = [];
  const actual = typeOf(value);
  if (schema.type !== undefined) {
    const allowed = [schema.type].flat();
    if (!allowed.some((type) => type === actual || (type === 'number' && actual === 'integer'))) {
      return [`${path}: ${actual} is not ${allowed.join('|')}`];
    }
  }
  if (schema.enum && !schema.enum.some((entry) => JSON.stringify(entry) === JSON.stringify(value))) errors.push(`${path}: not in enum`);
  if ('const' in schema && JSON.stringify(schema.const) !== JSON.stringify(value)) errors.push(`${path}: not the const`);
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: below minimum`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: above maximum`);
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && [...value].length < schema.minLength) errors.push(`${path}: too short`);
    if (schema.maxLength !== undefined && [...value].length > schema.maxLength) errors.push(`${path}: too long`);
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, 'u').test(value)) errors.push(`${path}: pattern`);
    if (schema.format === 'date-time' && Number.isNaN(Date.parse(value))) errors.push(`${path}: not a date-time`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: too few items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: too many items`);
    if (schema.uniqueItems && new Set(value.map((entry) => JSON.stringify(entry))).size !== value.length) errors.push(`${path}: duplicate items`);
    if (schema.items) value.forEach((entry, index) => errors.push(...schemaErrors(schema.items, entry, `${path}[${index}]`)));
  }
  if (actual === 'object') {
    const keys = Object.keys(value);
    if (schema.minProperties !== undefined && keys.length < schema.minProperties) errors.push(`${path}: too few properties`);
    for (const key of schema.required ?? []) if (!(key in value)) errors.push(`${path}: missing ${key}`);
    for (const key of keys) {
      if (schema.propertyNames) errors.push(...schemaErrors(schema.propertyNames, key, `${path}{${key}}`));
      if (schema.properties && key in schema.properties) {
        errors.push(...schemaErrors(schema.properties[key], value[key], `${path}.${key}`));
      } else if (schema.additionalProperties !== undefined) {
        errors.push(...schemaErrors(schema.additionalProperties, value[key], `${path}.${key}`));
      }
    }
  }
  if (schema.allOf) for (const part of schema.allOf) errors.push(...schemaErrors(part, value, path));
  if (schema.anyOf && !schema.anyOf.some((part) => schemaErrors(part, value, path).length === 0)) errors.push(`${path}: no anyOf branch`);
  if (schema.oneOf && schema.oneOf.filter((part) => schemaErrors(part, value, path).length === 0).length !== 1) errors.push(`${path}: not exactly one oneOf branch`);
  if (schema.not && schemaErrors(schema.not, value, path).length === 0) errors.push(`${path}: matches not`);
  if (schema.if && schemaErrors(schema.if, value, path).length === 0 && schema.then) errors.push(...schemaErrors(schema.then, value, path));
  return errors;
}

const outputSchemaOf = (name) => TOOLS_FOR_LIST.find((tool) => tool.name === name).outputSchema;

function assertConforms(toolName, structured) {
  assert.deepEqual(schemaErrors(outputSchemaOf(toolName), structured).slice(0, 5), [], `${toolName} answer must match its outputSchema`);
}

function writeNode(root, slug, frontmatter, body) {
  writeFileSync(join(root, `${slug}.md`), [
    '---',
    ...Object.entries(frontmatter).map(([key, value]) => `${key}: ${JSON.stringify(value)}`),
    '---',
    body,
  ].join('\n'));
}

/**
 * 30 capabilities that leave their definition, boundaries and uncertainty
 * unstated (warnings), and two notes with an empty `kind:` (errors).
 */
function vaultWithProblems() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-response-bounds-')));
  mkdirSync(join(root, 'domains'));
  mkdirSync(join(root, 'capabilities'));
  const capabilities = Array.from({ length: 30 }, (_, index) => `capabilities/c-${String(index).padStart(2, '0')}`);
  writeNode(root, 'project', { uid: randomUUID(), slug: 'project', kind: 'project', title: 'Bounds', domains: ['domains/core'] }, 'The project.');
  writeNode(root, 'domains/core', { uid: randomUUID(), slug: 'domains/core', kind: 'domain', title: 'Core', capabilities }, [
    'The core domain owns every capability this fixture writes, so a reader can see how pages and briefs stay bounded.',
    '',
    '## Includes',
    '- The thirty capabilities that each leave their meaning unstated.',
    '',
    '## Excludes',
    '- Ordinary notes that sit in the same folder without a kind.',
    '',
    '## Uncertainty',
    '- Whether a real product would group these capabilities this way.',
  ].join('\n'));
  for (const slug of capabilities) {
    writeNode(root, slug, { uid: randomUUID(), slug, kind: 'capability', title: slug, domain: 'domains/core' }, 'Short.');
  }
  for (const slug of ['broken-a', 'broken-b']) writeFileSync(join(root, `${slug}.md`), '---\nkind: ""\ntitle: Broken\n---\nBody.\n');
  return root;
}

/** Runs tool handlers in their own process, with the vault root they read at import. */
function inServer(root, body) {
  const modules = Object.fromEntries(['tools/graph.mjs', 'tools/validate-vault.mjs', 'tools/read.mjs', 'server/rpc.mjs']
    .map((file) => [file, new URL(`./${file}`, import.meta.url).href]));
  const script = `
    const { queryOntologyTool, compileOntologyTool } = await import(${JSON.stringify(modules['tools/graph.mjs'])});
    const { validateVaultTool } = await import(${JSON.stringify(modules['tools/validate-vault.mjs'])});
    const { findEvidence } = await import(${JSON.stringify(modules['tools/read.mjs'])});
    const { ok } = await import(${JSON.stringify(modules['server/rpc.mjs'])});
    ${body}
  `;
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    env: { ...process.env, OATLAS_VAULT: root, OATLAS_REPO_ROOT: root },
    maxBuffer: 64 * 1024 * 1024,
  }));
}

test('a brief carries at most 20 problem files and the validate_vault call for the rest', () => {
  const root = vaultWithProblems();
  try {
    const result = inServer(root, `
      const health = await queryOntologyTool({ operation: 'health' });
      const workspace = await queryOntologyTool({ operation: 'workspace_brief' });
      const agent = await queryOntologyTool({ operation: 'agent_brief' });
      console.log(JSON.stringify({
        briefs: [health.validation, workspace.health.validation, agent.health.validation],
        checks: [health.checks, workspace.health.checks, agent.health.checks]
          .map((checks) => checks.find((check) => check.id === 'vault_validation')),
      }));
    `);
    for (const [index, validation] of result.briefs.entries()) {
      assert.equal(validation.problems.length, 20, `brief ${index} carries 20 rows`);
      assert.equal(validation.summary.problemFiles, 32, 'the counts stay whole-vault');
      assert.equal(validation.summary.errorFiles, 2);
      assert.deepEqual(validation.problemsPagination, { offset: 0, limit: 20, total: 32, returned: 20, hasMore: true, nextOffset: 20 });
      assert.deepEqual(validation.nextCall, { tool: 'validate_vault', arguments: { offset: 20 } });
      assert.deepEqual(validation.problems.slice(0, 2).map((row) => row.slug), ['broken-a', 'broken-b'], 'files with errors come first');
      assert.ok(Object.values(validation.summary.byCode).every((entry) => entry.files.length <= 20));
    }
    for (const check of result.checks) {
      assert.equal(check.status, 'fail', 'the check is judged on the whole vault');
      assert.match(check.message, /^2 file\(s\) have blocking/);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('path drifts past a brief\'s list are counted, not dropped', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-drift-bounds-')));
  try {
    mkdirSync(join(root, 'domains'));
    mkdirSync(join(root, 'capabilities'));
    const capabilities = Array.from({ length: 25 }, (_, index) => `capabilities/d-${String(index).padStart(2, '0')}`);
    writeNode(root, 'project', { uid: randomUUID(), slug: 'project', kind: 'project', title: 'Drift', domains: ['domains/core'] }, 'The project.');
    writeNode(root, 'domains/core', { uid: randomUUID(), slug: 'domains/core', kind: 'domain', title: 'Core', capabilities }, 'The domain.');
    for (const [index, slug] of capabilities.entries()) {
      writeNode(root, slug, {
        uid: randomUUID(), slug, kind: 'capability', title: slug, domain: 'domains/core', path: `src/missing-${index}.ts`,
      }, 'Short.');
    }
    const result = inServer(root, `
      const health = await queryOntologyTool({ operation: 'health' });
      const compact = await queryOntologyTool({ operation: 'agent_brief', detail: 'compact', task: 'Explain the drift fixture.' });
      console.log(JSON.stringify({
        drift: health.validation.pathDrift,
        nextCall: health.validation.nextCall,
        check: health.checks.find((check) => check.id === 'vault_validation'),
        compactDrifts: compact.validation.driftCount,
        tool: validateVaultTool({}).pathDrift,
      }));
    `);
    assert.equal(result.drift.drifts.length, 20);
    assert.equal(result.drift.driftsOmitted, 5);
    assert.equal(result.nextCall.tool, 'validate_vault');
    assert.match(result.check.message, /source paths 25;/, 'the check counts every drift');
    assert.equal(result.compactDrifts, 25, 'the compact brief counts the omitted drifts too');
    assert.equal(result.tool.drifts.length, 25, 'validate_vault lists up to 100');
    assert.equal(result.tool.driftsOmitted, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('validate_vault pages every problem file once, errors first, and each page matches its schema', () => {
  const root = vaultWithProblems();
  try {
    const result = inServer(root, `
      const pages = [];
      let offset = 0;
      for (let guard = 0; guard < 10; guard += 1) {
        const page = validateVaultTool({ offset, limit: 12 });
        pages.push(page);
        if (!page.problemsPagination.hasMore) break;
        offset = page.problemsPagination.nextOffset;
      }
      const whole = validateVaultTool({ limit: 500 });
      console.log(JSON.stringify({ pages, whole }));
    `);
    const slugs = result.pages.flatMap((page) => page.problems.map((row) => row.slug));
    assert.equal(result.pages.length, 3);
    assert.equal(slugs.length, 32);
    assert.equal(new Set(slugs).size, 32, 'no file repeats across pages');
    assert.deepEqual(slugs, result.whole.problems.map((row) => row.slug), 'pages concatenate to the whole list');
    assert.deepEqual(slugs.slice(0, 2), ['broken-a', 'broken-b']);
    assert.deepEqual(slugs.slice(2), [...slugs.slice(2)].sort((left, right) => left.localeCompare(right)), 'then by slug');
    assert.match(result.pages[0].problemsHint, /^Problem files 1-12 of 32.*validate_vault\(\{ offset: 12 \}\)/);
    assert.equal(result.pages.at(-1).problemsPagination.nextOffset, null);
    const warningCode = Object.entries(result.whole.summary.byCode).find(([, entry]) => entry.count === 30);
    assert.ok(warningCode, 'a code every capability has');
    assert.equal(warningCode[1].files.length, 20);
    assert.equal(warningCode[1].filesOmitted, 10);
    for (const page of [...result.pages, result.whole]) assertConforms('validate_vault', page);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('compile_ontology answers with the bounded summary unless arrays are asked for', () => {
  const root = vaultWithProblems();
  try {
    const result = inServer(root, `
      console.log(JSON.stringify({
        bare: compileOntologyTool({}),
        full: compileOntologyTool({ full: true }),
        paged: compileOntologyTool({ nodesLimit: 5 }),
        explicitSummary: compileOntologyTool({ summary: true }),
      }));
    `);
    assert.equal(result.bare.nodes, undefined);
    assert.equal(result.bare.nodeCount, 32);
    assert.deepEqual(result.bare.delivery.fullArguments, { full: true });
    assert.equal(result.full.nodes.length, 32);
    assert.equal(result.full.delivery, undefined);
    assert.equal(result.paged.nodes.length, 5);
    assert.equal(result.explicitSummary.delivery, undefined);
    for (const answer of Object.values(result)) assertConforms('compile_ontology', answer);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('find_evidence returns the best 50 by default and says how many matched', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-evidence-limit-')));
  try {
    for (let index = 0; index < 60; index += 1) {
      writeNode(root, `note-${String(index).padStart(2, '0')}`, { title: `Signal note ${index}` }, 'A note about the signal.');
    }
    const result = inServer(root, `
      console.log(JSON.stringify({ bare: findEvidence({ title: 'signal' }), wide: findEvidence({ title: 'signal', limit: 500 }) }));
    `);
    assert.equal(result.bare.matches.length, 50);
    assert.equal(result.bare.total, 60);
    assert.equal(result.bare.limited, true);
    assert.match(result.bare.limitHint, /50 best of 60/);
    assert.equal(result.wide.matches.length, 60);
    assert.equal(result.wide.limited, false);
    assert.equal(result.wide.limitHint, undefined);
    for (const answer of Object.values(result)) assertConforms('find_evidence', answer);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the response budget cuts the longest list, keeps its page resumable and says so', () => {
  const rows = Array.from({ length: 900 }, (_, index) => ({ slug: `capabilities/c-${index}`, note: 'x'.repeat(300) }));
  const result = {
    rows,
    rowsPagination: { offset: 40, limit: 900, total: 2000, returned: 900, hasMore: true, nextOffset: 940 },
    rowsHint: 'Rows 41-940 of 2000.',
    nextCall: { tool: 'some_tool', arguments: { offset: 940 } },
    small: [1, 2, 3],
  };
  const response = ok(result, { tool: 'validate_vault' });
  const structured = response.structuredContent;
  const text = response.content[0].text;
  assert.deepEqual(JSON.parse(text), structured, 'the text and structuredContent carry one answer');
  assert.ok(Buffer.byteLength(text, 'utf8') <= RESPONSE_TEXT_BUDGET_BYTES, 'the answer fits the budget');
  assert.equal(structured.truncated, true);
  const kept = structured.rows.length;
  assert.ok(kept > 0 && kept < 900);
  assert.deepEqual(structured.truncation.cut, [{ path: 'rows', kept, total: 900 }]);
  assert.deepEqual(structured.rows, rows.slice(0, kept), 'a cut keeps the leading rows');
  assert.deepEqual(structured.rowsPagination, { offset: 40, limit: 900, total: 2000, returned: kept, hasMore: true, nextOffset: 40 + kept });
  assert.deepEqual(structured.nextCall.arguments, { offset: 40 + kept }, 'a pointer to the next page moves with it');
  assert.equal(structured.rowsHint, undefined, 'a hint about the uncut page is dropped');
  assert.deepEqual(structured.small, [1, 2, 3]);
  assert.match(structured.truncation.hint, /offset, limit/);
  assert.deepEqual(result.rows.length, 900, 'the handler result is not modified');
});

test('the response budget leaves small, explicit and list-free answers alone', () => {
  const small = { rows: [{ slug: 'a' }] };
  assert.equal(ok(small).structuredContent, small);
  const large = { rows: Array.from({ length: 900 }, () => 'y'.repeat(300)) };
  assert.equal(ok(large, { bounded: false }).structuredContent, large, 'bounded: false is honoured');
  const noList = { text: 'z'.repeat(RESPONSE_TEXT_BUDGET_BYTES + 10) };
  assert.equal(ok(noList).structuredContent, noList, 'nothing to cut means nothing cut');
  const compact = { contract: 'agentBriefCompact:v2', handoffPrompt: 'Read these files.', rows: large.rows };
  assert.equal(ok(compact).content[0].text, 'Read these files.');
});

test('a cut list_concepts page corrects returned, limited and nextOffset and still matches its schema', () => {
  const nodes = Array.from({ length: 500 }, (_, index) => ({
    uid: randomUUID(),
    slug: `capabilities/c-${index}`,
    kind: 'capability',
    title: `Capability ${index} ${'t'.repeat(200)}`,
    mtime: 1,
  }));
  const result = {
    total: 1200,
    vaultRoot: '/vault',
    nodes,
    returned: 500,
    limited: false,
    pagination: { offset: 0, limit: 500, total: 1200, returned: 500, hasMore: true, nextOffset: 500 },
  };
  const structured = ok(result, { tool: 'list_concepts' }).structuredContent;
  const kept = structured.nodes.length;
  assert.ok(kept < 500);
  assert.equal(structured.returned, kept);
  assert.equal(structured.limited, true);
  assert.equal(structured.pagination.nextOffset, kept);
  assertConforms('list_concepts', structured);
});

test('every tool output schema declares the truncation note', () => {
  for (const tool of TOOLS_FOR_LIST) {
    assert.equal(tool.outputSchema?.properties?.truncated?.type, 'boolean', tool.name);
    assert.deepEqual(tool.outputSchema?.properties?.truncation?.required, ['budgetBytes', 'fullBytes', 'cut', 'hint'], tool.name);
  }
});
