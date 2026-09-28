import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { schemaErrors } from '../../scripts/lib/output-schema-errors.mjs';
import { TOOLS_FOR_LIST } from './server/registry.mjs';
import { ok } from './server/rpc.mjs';

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

function inServer(root, body) {
  const modules = Object.fromEntries(['tools/graph.mjs', 'tools/validate-vault.mjs', 'tools/read.mjs', 'server/rpc.mjs']
    .map((file) => [file, new URL(`./${file}`, import.meta.url).href]));
  const script = `
    const { queryOntologyTool, compileOntologyTool } = await import(${JSON.stringify(modules['tools/graph.mjs'])});
    const { validateVaultTool } = await import(${JSON.stringify(modules['tools/validate-vault.mjs'])});
    const { findEvidence, readSourceTool } = await import(${JSON.stringify(modules['tools/read.mjs'])});
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
      assert.deepEqual(Object.keys(validation).slice(0, 3), ['nextCall', 'problemsPagination', 'problemsHint'], 'the way on comes first');
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

test('a brief and validate_vault list every path drift', () => {
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
        check: health.checks.find((check) => check.id === 'vault_validation'),
        compactDrifts: compact.validation.driftCount,
        tool: validateVaultTool({}).pathDrift,
      }));
    `);
    assert.equal(result.drift.drifts.length, 25);
    assert.match(result.check.message, /source paths 25;/, 'the check counts every drift');
    assert.equal(result.compactDrifts, 25);
    assert.equal(result.tool.drifts.length, 25);
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
      const rooted = validateVaultTool({ repoRoot: process.env.OATLAS_REPO_ROOT, limit: 12 });
      console.log(JSON.stringify({ pages, whole, rooted }));
    `);
    const slugs = result.pages.flatMap((page) => page.problems.map((row) => row.slug));
    assert.equal(result.pages.length, 3);
    assert.equal(slugs.length, 32);
    assert.equal(new Set(slugs).size, 32, 'no file repeats across pages');
    assert.deepEqual(slugs, result.whole.problems.map((row) => row.slug), 'pages concatenate to the whole list');
    assert.deepEqual(slugs.slice(0, 2), ['broken-a', 'broken-b']);
    assert.deepEqual(slugs.slice(2), [...slugs.slice(2)].sort((left, right) => left.localeCompare(right)), 'then by slug');
    assert.match(result.pages[0].problemsHint, /^Problem files 1-12 of 32.*validate_vault\(\{"offset":12,"limit":12\}\)/);
    assert.ok(
      result.rooted.problemsHint.endsWith(`validate_vault(${JSON.stringify({ offset: 12, repoRoot: root, limit: 12 })}).`),
      'the next call keeps the caller\'s repoRoot and limit',
    );
    assert.deepEqual(Object.keys(result.pages[0]).slice(0, 2), ['problemsPagination', 'problemsHint']);
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
    assert.equal(Object.keys(result.bare)[0], 'delivery');
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
    assert.equal(Object.keys(result.bare)[0], 'limitHint');
    assert.equal(result.wide.matches.length, 60);
    assert.equal(result.wide.limited, false);
    assert.equal(result.wide.limitHint, undefined);
    for (const answer of Object.values(result)) assertConforms('find_evidence', answer);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ok() sends the JSON text the MCP spec asks for and the structuredContent an outputSchema client requires', () => {
  const result = { rows: [{ slug: 'a' }] };
  const response = ok(result);
  assert.equal(response.content[0].text, JSON.stringify(result, null, 2));
  assert.equal(response.structuredContent, result);
});

test('read_source answers match its outputSchema whether or not they are cut', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-read-source-schema-')));
  try {
    mkdirSync(join(root, 'sources'));
    writeFileSync(join(root, 'sources', 'plan.txt'), Array.from({ length: 30 }, (_, index) => `Line ${index + 1} of the plan.`).join('\n'));
    const result = inServer(root, `
      console.log(JSON.stringify({
        whole: readSourceTool({ path: 'sources/plan.txt' }),
        cut: readSourceTool({ path: 'sources/plan.txt', limit: 5 }),
      }));
    `);
    assert.equal(result.whole.truncated, false);
    assert.equal(result.cut.truncated, true);
    for (const answer of Object.values(result)) assertConforms('read_source', answer);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
