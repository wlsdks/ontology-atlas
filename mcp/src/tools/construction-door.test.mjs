/**
 * The door a builder walks on an empty vault inside its own repository: write,
 * bind, finalize. Each assertion is a defect measured in a real build, so the
 * calls run through the server process the agent talks to.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { runJsonRpcProcess } from '../../../scripts/lib/mcp-test-rpc.mjs';
import { renderProjectCompetencyMarkdown } from '../project-meaning/project-meaning-receipt.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const serverEntry = process.env.OATLAS_TEST_SERVER_ENTRY ?? join(here, '..', 'index.js');

function repository() {
  const root = mkdtempSync(join(tmpdir(), 'atlas-construction-door-'));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'README.md'), '# Ledger\n\nLedger charges customers.\n');
  writeFileSync(join(root, 'src', 'charge.mjs'), 'export function charge() {\n  return 1;\n}\n');
  writeFileSync(join(root, 'src', 'refund.mjs'), 'export function refund() {\n  return 0;\n}\n');
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', [
    '-c', 'user.name=Atlas Test', '-c', 'user.email=atlas@example.invalid', 'commit', '-q', '-m', 'fixture',
  ], { cwd: root });
  return root;
}

function server(root) {
  const vault = join(root, 'atlas');
  mkdirSync(vault, { recursive: true });
  return async (name, args) => {
    const { responses } = await runJsonRpcProcess({
      command: process.execPath, args: [serverEntry], timeoutMs: 30_000,
      env: { ...process.env, OATLAS_VAULT: vault, OATLAS_REPO_ROOT: root },
      requests: [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: {
          protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'construction-door-test', version: '1' },
        } },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } },
      ],
    });
    const result = responses.find(({ id }) => id === 2)?.result;
    assert.ok(result, `${name} returned no result`);
    const text = result.content?.[0]?.text ?? '';
    return result.isError ? { error: text } : (result.structuredContent ?? JSON.parse(text));
  };
}

const BODY = 'Defines the thing this fixture names.\n\n## Includes\n- One boundary.\n\n## Excludes\n- Another boundary.\n\n## Uncertainty\nNothing else was read.\n';

function competencyBody(evidenceWitnesses, concepts = ['capabilities/charge']) {
  const gap = (id) => ({
    status: 'partial', answer: `The ${id} answer is partial.`, gap: 'The fixture leaves this open.',
    witnesses: { concepts: [], relations: [], evidence: [], paths: [] },
  });
  return `Ledger charges customers.\n\n${renderProjectCompetencyMarkdown({
    scope: gap('scope'),
    domains: gap('domains'),
    abilities: gap('abilities'),
    evidence: {
      status: 'answered',
      answer: 'Charging enters at the file the capability names.',
      witnesses: { concepts, relations: [], evidence: evidenceWitnesses, paths: ['src/charge.mjs'] },
    },
    impact: gap('impact'),
  })}`;
}

test('a build on an empty vault inside its repository reaches finalize without extra reads', async (t) => {
  const root = repository();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const call = server(root);

  const created = await call('add_concepts', { concepts: [
    { slug: 'ledger', kind: 'project', title: 'Ledger', labels: { en: 'Ledger' }, body: BODY },
    { slug: 'domains/payments', kind: 'domain', title: 'Payments', labels: { en: 'Payments' }, body: BODY },
    { slug: 'capabilities/charge', kind: 'capability', title: 'Charge', labels: { en: 'Charge' }, domain: 'domains/payments', path: 'src/charge.mjs', body: BODY },
    { slug: 'capabilities/refund', kind: 'capability', title: 'Refund', labels: { en: 'Refund' }, domain: 'domains/payments', path: 'src/refund.mjs', body: BODY },
  ] });
  for (const row of created.concepts) {
    assert.equal(row.ok, true, JSON.stringify(row));
    assert.equal(typeof row.mtime, 'number', 'a create returns the mtime the next write guards with');
    assert.ok(!(row.warnings ?? []).some((warning) => warning.includes('labels')), 'a one-locale vault has no locale to add');
  }

  const createdMtime = Object.fromEntries(created.concepts.map((row) => [row.slug, row.mtime]));
  const related = await call('add_relations', { relations: [
    { from: 'ledger', to: 'domains/payments', type: 'contains', why: 'Payments is the ledger\'s one area.', expected_mtime: createdMtime.ledger },
    { from: 'domains/payments', to: 'capabilities/charge', type: 'contains', why: 'Charging is a payment ability.', expected_mtime: createdMtime['domains/payments'] },
    { from: 'domains/payments', to: 'capabilities/refund', type: 'capabilities', why: 'Refunding is a payment ability.' },
  ] });
  assert.deepEqual(related.relations.map((row) => row.type), ['domains', 'capabilities', 'capabilities']);
  assert.match(related.relations[0].notice, /written as the typed key "domains"/);
  assert.match(readFileSync(join(root, 'atlas', 'ledger.md'), 'utf8'), /^domains: \[domains\/payments\]$/m);
  assert.equal(typeof related.mtimes.ledger, 'number');
  assert.equal(typeof related.mtimes['domains/payments'], 'number');

  const bound = await call('connect_project_source', { projectSlug: 'ledger', rootPath: root, confirm: true });
  assert.equal(bound.projectSource.currentness, 'current', 'the vault folder is not the code it describes');
  assert.equal(bound.binding.dirty, false);

  const staleHash = `source:src/charge.mjs#L1-L3@sha256:${'0'.repeat(64)}`;
  const patched = await call('patch_concept', {
    slug: 'ledger',
    expected_mtime: related.mtimes.ledger,
    body: competencyBody([staleHash, 'src/unmeasured.mjs'], ['capabilities/charge', 'capabilities/ghost']),
  });
  assert.equal(typeof patched.mtime, 'number');

  const refused = await call('finalize_project_meaning', { projectSlug: 'ledger', expected_mtime: patched.mtime });
  assert.ok(refused.error, 'the answered evidence row cites witnesses that do not resolve');
  assert.match(refused.error, /- evidence: /);
  assert.match(refused.error, /concept `capabilities\/ghost` is not in this project's containment graph/);
  assert.match(refused.error, /no longer matches `src\/charge\.mjs`/);
  assert.match(refused.error, /evidence `src\/unmeasured\.mjs` is not a measured source witness/);
  assert.match(refused.error, /call connect_project_source again/);

  const sha = createHash('sha256').update(readFileSync(join(root, 'src', 'charge.mjs'))).digest('hex');
  // One of the two capabilities is cited: whether that answers "each" is the person's call.
  const repaired = await call('patch_concept', {
    slug: 'ledger',
    expected_mtime: patched.mtime,
    body: competencyBody([`source:src/charge.mjs#L1-L3@sha256:${sha}`]),
  });
  const finalized = await call('finalize_project_meaning', { projectSlug: 'ledger', expected_mtime: repaired.mtime });
  assert.equal(finalized.error, undefined, finalized.error);
  assert.equal(finalized.ok, true);
});

test('a relation write never hands out an mtime that would let a body write pass over an unread edit', async (t) => {
  const root = repository();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const call = server(root);
  const created = await call('add_concepts', { concepts: [
    { slug: 'ledger', kind: 'project', title: 'Ledger', labels: { en: 'Ledger' }, body: BODY },
    { slug: 'domains/payments', kind: 'domain', title: 'Payments', labels: { en: 'Payments' }, body: BODY },
  ] });
  const ledger = join(root, 'atlas', 'ledger.md');
  writeFileSync(ledger, `${readFileSync(ledger, 'utf8')}\nA note the person added.\n`);

  const related = await call('add_relation', { from: 'ledger', to: 'domains/payments', type: 'domains', why: 'Payments is the ledger\'s one area.' });
  assert.equal(related.changed, true);
  assert.equal(related.mtime, undefined, 'an unguarded relation write did not read the body');
  const batch = await call('add_relations', { relations: [
    { from: 'domains/payments', to: 'ledger', type: 'relates', why: 'The fixture links back.' },
  ] });
  assert.equal(batch.mtimes, undefined);
  const again = await call('add_relation', { from: 'ledger', to: 'domains/payments', type: 'domains' });
  assert.equal(again.alreadyExists, true);
  assert.equal(again.mtime, undefined);

  // The newest mtime the agent holds is the one its own create returned.
  const newest = related.mtime ?? created.concepts[0].mtime;
  const overwrite = await call('patch_concept', { slug: 'ledger', expected_mtime: newest, body: BODY });
  assert.match(overwrite.error ?? '', /conflict|modified|mtime/i, 'a body write over an unread edit must not land');
  assert.match(readFileSync(ledger, 'utf8'), /A note the person added\./);
});

test('remove_relation and replace_relation read "contains" as the typed key add_relation wrote', async (t) => {
  const root = repository();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const call = server(root);
  await call('add_concepts', { concepts: [
    { slug: 'ledger', kind: 'project', title: 'Ledger', labels: { en: 'Ledger' }, body: BODY },
    { slug: 'domains/payments', kind: 'domain', title: 'Payments', labels: { en: 'Payments' }, body: BODY },
    { slug: 'domains/billing', kind: 'domain', title: 'Billing', labels: { en: 'Billing' }, body: BODY },
  ] });
  const ledger = join(root, 'atlas', 'ledger.md');
  await call('add_relation', { from: 'ledger', to: 'domains/payments', type: 'contains', why: 'Payments is one area.' });

  const replaced = await call('replace_relation', {
    from: 'ledger', oldTo: 'domains/payments', oldType: 'contains', newTo: 'domains/billing', newType: 'contains', confirm: true,
  });
  assert.equal(replaced.error, undefined, replaced.error);
  assert.deepEqual([replaced.oldRelation.type, replaced.newRelation.type], ['domains', 'domains']);
  assert.match(readFileSync(ledger, 'utf8'), /^domains: \[domains\/billing\]$/m);
  assert.doesNotMatch(readFileSync(ledger, 'utf8'), /^contains:/m);

  const removed = await call('remove_relation', { from: 'ledger', to: 'domains/billing', type: 'contains', confirm: true });
  assert.equal(removed.changed, true, JSON.stringify(removed));
  assert.equal(removed.type, 'domains');
  assert.doesNotMatch(readFileSync(ledger, 'utf8'), /domains\/billing/);
});

test('the locale warning names the locale other nodes use and is silent otherwise', async (t) => {
  const root = repository();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const call = server(root);
  const first = await call('add_concept', { slug: 'domains/payments', kind: 'domain', title: 'Payments', labels: { en: 'Payments', ko: '결제' }, body: BODY });
  assert.ok(!(first.warnings ?? []).some((warning) => warning.includes('labels')));
  const second = await call('add_concept', { slug: 'domains/refunds', kind: 'domain', title: 'Refunds', labels: { en: 'Refunds' }, body: BODY });
  assert.ok(second.warnings.some((warning) => /labels has no "ko"/.test(warning)), JSON.stringify(second.warnings));
});

test('the survey is a breadth map of units, entry points and docs, with no candidate node', async (t) => {
  const root = repository();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'README.md'), '# Ledger\n\nLedger charges customers and refunds them when an order is cancelled.\n\n## Credits\n');
  mkdirSync(join(root, 'lib'));
  writeFileSync(join(root, 'lib', 'store.mjs'), "import { charge } from '../src/charge.mjs';\nexport const store = charge;\n");
  mkdirSync(join(root, 'tests'));
  writeFileSync(join(root, 'tests', 'charge.test.mjs'), "import { charge } from '../src/charge.mjs';\ncharge();\n");
  mkdirSync(join(root, 'docs'));
  writeFileSync(join(root, 'docs', 'refunds.md'), '# Refund rules\n\nA refund needs a captured charge.\n');
  const survey = await server(root)('analyze_repo_structure', { ignore: ['atlas'] });
  assert.equal(survey.contract, 'breadthMap:v1');
  for (const removed of ['domains', 'capabilities', 'elements', 'suggestedRelations', 'meaningGate', 'extractionContract', 'proposalValidation']) {
    assert.equal(survey[removed], undefined, `${removed} is not part of the default survey`);
  }
  assert.deepEqual(survey.size, { productFiles: 3, productLines: 8, units: 2, outside: { test: { files: 1, lines: 2 } } });
  assert.deepEqual(survey.units.map((unit) => unit.path), ['lib', 'src']);
  const lib = survey.units.find((unit) => unit.path === 'lib');
  assert.deepEqual(lib.imports, ['src'], 'a product import between units is an edge');
  assert.equal(survey.units.find((unit) => unit.path === 'src').importedBy, 1, 'the test file\'s import is not counted');
  assert.deepEqual(lib.exports, ['store']);
  assert.match(survey.docs.readme.purpose, /charges customers/);
  assert.deepEqual(survey.docs.pages, [{ path: 'docs/refunds.md', title: 'Refund rules' }]);
  assert.match(survey.next, /^2 product units, 8 lines in 3 files\./);
});

test('outline reads take sixteen selectors and answer without the map or a limits block', async (t) => {
  const root = repository();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sourceReads = Array.from({ length: 16 }, (_, index) => ({ path: index % 2 ? 'src/refund.mjs' : 'src/charge.mjs', mode: 'outline' }));
  const reads = await server(root)('analyze_repo_structure', { sourceReads });
  assert.equal(reads.delivery, 'source_only');
  assert.equal(reads.units, undefined);
  assert.equal(reads.sourceEvidence.rows.length, 16);
  assert.equal(reads.sourceEvidence.limits, undefined);
});
