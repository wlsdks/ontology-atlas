import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { runJsonRpcProcess } from '../../scripts/lib/mcp-test-rpc.mjs';
import {
  RAW_SOURCE_PATH,
  RAW_SOURCE_SLUG,
  RAW_SOURCE_TEXT,
  makeRawSourceVault,
} from '../../tests/fixtures/raw-source-vault.mjs';
import { loadVaultDocs } from './vault/documents.mjs';

const SERVER_ENTRY = resolve(dirname(fileURLToPath(import.meta.url)), 'index.js');
const FOLDED_SLUG = 'ſources/Planning/roadmap';
const call = (id, name, args = {}) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });

let vault;
let results;
let docSlugs;
let sourcesBefore;
let diskFoldsCase;

const listSources = () => readdirSync(join(vault, 'sources'), { recursive: true }).map(String).sort();

before(async () => {
  vault = makeRawSourceVault();
  symlinkSync('sources', join(vault, 'inbox'));
  diskFoldsCase = existsSync(join(vault, 'ſources'));
  docSlugs = loadVaultDocs(vault).map((doc) => doc.slug).sort();
  sourcesBefore = listSources();
  const { responses } = await runJsonRpcProcess({
    command: process.execPath,
    args: [SERVER_ENTRY],
    env: { ...process.env, OATLAS_VAULT: vault },
    requests: [
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
      },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      call(2, 'list_concepts'),
      call(3, 'list_kinds'),
      call(4, 'query_concepts', { filter: 'kind=domain' }),
      call(5, 'compile_ontology'),
      call(6, 'find_backlinks', { slug: 'domains/planning' }),
      call(7, 'get_concept', { slug: RAW_SOURCE_SLUG }),
      call(8, 'validate_vault'),
      call(9, 'validate_wiki'),
      call(10, 'read_source', { path: RAW_SOURCE_PATH }),
      call(11, 'add_concept', { slug: 'sources/Planning/next', kind: 'domain', title: 'Next' }),
      call(12, 'patch_concept', { slug: RAW_SOURCE_SLUG, frontmatter: { title: 'Changed' } }),
      call(13, 'patch_concept', { slug: 'Sources/Planning/roadmap', frontmatter: { title: 'Changed' } }),
      call(14, 'delete_concept', { slug: RAW_SOURCE_SLUG, confirm: true }),
      call(15, 'rename_concept', { oldSlug: 'domains/planning', newSlug: 'sources/planning', confirm: true }),
      call(16, 'get_concept', { slug: FOLDED_SLUG }),
      call(17, 'patch_concept', { slug: FOLDED_SLUG, frontmatter: { title: 'Folded' } }),
      call(18, 'add_concept', { slug: 'ſources/Planning/folded', kind: 'domain', title: 'Folded' }),
      call(19, 'patch_concept', { slug: 'inbox/Planning/roadmap', frontmatter: { title: 'Aliased' } }),
      call(20, 'add_relation', { from: 'domains/planning', to: RAW_SOURCE_SLUG, type: 'relates', why: 'probe' }),
      call(21, 'rename_concept', { oldSlug: `./${RAW_SOURCE_SLUG}`, newSlug: 'domains/roadmap', confirm: true }),
    ],
    timeoutMs: 30_000,
  });
  results = new Map(responses.map((response) => [response.id, response.result]));
});

after(() => rmSync(vault, { recursive: true, force: true }));

const structured = (id) => results.get(id).structuredContent;

test('a Markdown file under sources/ that carries kind: is on no read surface', () => {
  assert.deepEqual(docSlugs, ['domains/planning', 'wiki/roadmap-notes']);
  assert.deepEqual(structured(2).nodes.map((node) => node.slug), ['domains/planning']);
  assert.deepEqual(structured(3).byKind, { domain: 1 });
  assert.deepEqual(structured(4).matches.map((match) => match.slug), ['domains/planning']);
  assert.equal(structured(5).nodeCount, 1);
  assert.equal(structured(6).total, 0, 'a relation written inside a raw source is not a backlink');
});

test('get_concept on a raw source answers not_found and points at read_source', () => {
  assert.equal(results.get(7).isError, true);
  assert.equal(structured(7).errorCode, 'not_found');
  assert.deepEqual(structured(7).recoveryTools, ['read_source']);
  assert.deepEqual(structured(7).growthHint.exampleCall, { tool: 'read_source', args: { path: RAW_SOURCE_PATH } });
});

test('validate_vault names the raw source once, as kind-under-sources, never as a node problem', () => {
  const report = structured(8);
  assert.deepEqual(
    report.problems.map((problem) => [problem.slug, problem.issues.map((issue) => issue.code)]),
    [[RAW_SOURCE_SLUG, ['kind-under-sources']]],
  );
  assert.equal(report.summary.errorFiles, 0);
  assert.match(report.problems[0].issues[0].message, /move it into domains\/, then patch_concept each node/);
});

test('a wiki page citing the raw source still validates, and read_source still reads it', () => {
  assert.deepEqual(
    structured(9).pages.map((page) => [page.path, page.ok]),
    [['wiki/roadmap-notes.md', true]],
  );
  assert.equal(structured(10).units.find((unit) => unit.anchor === 'l9')?.text, 'Q4 ships the importer.');
});

test('write tools refuse a slug under sources/ and leave the raw source byte-identical', () => {
  for (const id of [11, 12, 13, 14, 15]) assert.equal(results.get(id).isError, true, `request ${id} was not refused`);
  for (const id of [11, 12, 14, 15]) assert.equal(structured(id).errorCode, 'invalid_arguments', `request ${id}`);
  assert.equal(readFileSync(join(vault, RAW_SOURCE_PATH), 'utf8'), RAW_SOURCE_TEXT);
  assert.equal(existsSync(join(vault, 'sources/Planning/next.md')), false);
  assert.equal(existsSync(join(vault, 'domains/planning.md')), true);
});

test('no other spelling and no in-vault link reaches the raw source', () => {
  assert.equal(structured(19).errorCode, 'invalid_arguments', 'a link aliasing sources/ was written through');
  if (diskFoldsCase) {
    assert.equal(structured(16).errorCode, 'not_found');
    assert.deepEqual(structured(16).recoveryTools, ['read_source']);
    assert.equal(structured(17).errorCode, 'invalid_arguments', 'ſources/ was patched on a case-folding disk');
    assert.equal(structured(18).errorCode, 'invalid_arguments', 'ſources/ was written on a case-folding disk');
  } else {
    assert.equal(results.get(16).isError, true);
    assert.equal(results.get(17).isError, true);
  }
  assert.deepEqual(listSources(), sourcesBefore);
  assert.equal(readFileSync(join(vault, RAW_SOURCE_PATH), 'utf8'), RAW_SOURCE_TEXT);
});

test('a relation or rename naming a raw source is refused with the raw-source reason', () => {
  for (const id of [20, 21]) {
    assert.equal(structured(id).errorCode, 'invalid_arguments', `request ${id}`);
    assert.match(results.get(id).content[0].text, /must not name a file under sources\//, `request ${id}`);
    assert.doesNotMatch(results.get(id).content[0].text, /list_concepts/, `request ${id}`);
  }
});
