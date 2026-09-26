import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { checkDoc, contractBumpProblems, listLivingDocs, routeExists, run } from './check-doc-meta.mjs';
import { createDoc } from './new-doc.mjs';
import { formerPaths } from './doc-history.mjs';
import { DOC_TYPES } from './lib/doc-types.mjs';

const SOURCE_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function fixture(files) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'doc-meta-'));
  for (const [file, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), body);
  }
  return root;
}

const feature = (extra = '') => `---\ntitle: Rounds\ndoc_type: feature\nstatus: current\narea: library\nroutes: [/library]\n${extra}---\n# Rounds\n`;

function keysOf(problems) {
  return problems.map((problem) => problem.key);
}

test('a well-formed living document passes; every missing or wrong key is named', () => {
  const root = fixture({
    'app/[locale]/library/page.tsx': '',
    'app/[locale]/project/[slug]/page.tsx': '',
    'docs/records/decisions/2026-09-17-library-rounds-0f0e0d0c-aaaa-4bbb-8ccc-123456789abc.md': '',
  });
  try {
    const options = { root, guideRegistry: "'guide/cli'" };
    assert.deepEqual(checkDoc('docs/features/rounds.md', feature(), options), []);
    assert.deepEqual(keysOf(checkDoc('docs/features/rounds.md', '# No frontmatter\n', options)), ['frontmatter']);
    assert.deepEqual(keysOf(checkDoc('docs/features/rounds.md', feature().replace('status: current\n', ''), options)), ['status']);
    assert.deepEqual(keysOf(checkDoc('docs/features/rounds.md', feature().replace('status: current', 'status: done'), options)), ['status']);
    assert.deepEqual(keysOf(checkDoc('docs/features/rounds.md', feature().replace('area: library', 'area: marketing'), options)), ['area']);
    // An ontology key would turn a living document into a graph node.
    assert.deepEqual(keysOf(checkDoc('docs/features/rounds.md', feature('kind: document\n'), options)), ['kind']);
    // Versions come from Git, never from a hand-edited field.
    assert.deepEqual(keysOf(checkDoc('docs/features/rounds.md', feature('revision: 3\n'), options)), ['revision']);
    assert.deepEqual(keysOf(checkDoc('docs/features/rounds.md', feature('owner: someone\n'), options)), ['owner']);
    // The folder decides the kind.
    assert.deepEqual(keysOf(checkDoc('docs/design/rounds.md', feature(), options)), ['doc_type']);
    // Pointers resolve.
    assert.deepEqual(keysOf(checkDoc('docs/features/rounds.md', feature().replace('/library', '/nowhere'), options)), ['routes']);
    assert.deepEqual(checkDoc('docs/features/rounds.md', feature().replace('/library', '/project/alpha'), options), []);
    assert.deepEqual(checkDoc('docs/features/rounds.md', feature('decisions: [0f0e0d0c-aaaa-4bbb-8ccc-123456789abc]\n'), options), []);
    assert.deepEqual(keysOf(checkDoc('docs/features/rounds.md', feature('decisions: [ffffffff-0000-4000-8000-000000000000]\n'), options)), ['decisions']);
    assert.deepEqual(keysOf(checkDoc('docs/features/rounds.md', feature('status: superseded\n').replace('status: current\n', ''), options)), ['superseded_by']);
    const contract = '---\ntitle: C\ndoc_type: contract\nstatus: current\narea: library\nstores: x\ncontract_version: 1\nenforced_by: [missing/file.ts]\n---\n';
    assert.deepEqual(keysOf(checkDoc('docs/contracts/c.md', contract, options)), ['enforced_by']);
    const guide = '---\ntitle: G\ndoc_type: guide\nstatus: current\narea: cli\n---\n';
    assert.deepEqual(checkDoc('docs/guide/cli.md', guide, options), []);
    assert.deepEqual(keysOf(checkDoc('docs/guide/other.md', guide, options)), ['gateway']);
    assert.deepEqual(checkDoc('docs/guide/other.md', guide.replace('area: cli', 'area: cli\ngateway: false'), options), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('frozen history is outside the scan, and the living set is not empty', () => {
  const root = fixture({
    'docs/DECISIONS.md': '# frozen\n',
    'docs/records/decisions/x.md': 'fragment\n',
    'docs/records/README.md': '# guide\n',
    'docs/archive/old.md': '# old\n',
    'docs/ontology/capabilities/a.md': '---\nkind: capability\n---\n',
    'docs/.templates/feature.md': '# template\n',
    'docs/ARCHITECTURE.md': '# arch\n',
  });
  try {
    assert.deepEqual(listLivingDocs(root), ['docs/ARCHITECTURE.md', 'docs/records/README.md']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  // The real tree is scanned, and it is more than a handful of files.
  assert.ok(listLivingDocs(SOURCE_ROOT).length > 40);
});

test('routes resolve against app/[locale], including dynamic segments', () => {
  assert.equal(routeExists('/topology', SOURCE_ROOT), true);
  assert.equal(routeExists('/', SOURCE_ROOT), true);
  assert.equal(routeExists('/project/[slug]', SOURCE_ROOT), true);
  assert.equal(routeExists('/admin', SOURCE_ROOT), false);
});

test('doc:new writes a document docs:meta accepts, for every creatable kind', () => {
  const root = fixture({
    'app/[locale]/library/page.tsx': '',
    'src/views/gateway-doc/model/guide-pages.ts': "'guide/probe-guide'",
  });
  try {
    for (const type of Object.keys(DOC_TYPES).filter((kind) => kind !== 'index')) {
      mkdirSync(path.join(root, 'docs', '.templates'), { recursive: true });
      writeFileSync(
        path.join(root, 'docs', '.templates', `${type}.md`),
        readFileSync(path.join(SOURCE_ROOT, 'docs', '.templates', `${type}.md`), 'utf8'),
      );
    }
    const created = [];
    for (const type of ['authority', 'guide', 'feature', 'design', 'runbook', 'spec', 'plan', 'launch']) {
      created.push(createDoc({ type, area: 'library', slug: `probe-${type}`, date: '2026-09-26', root }));
    }
    assert.throws(() => createDoc({ type: 'feature', area: 'library', slug: 'probe-feature', root }), /EEXIST/);
    assert.throws(() => createDoc({ type: 'index', area: 'library', slug: 'x', root }), /--type/);
    assert.throws(() => createDoc({ type: 'feature', area: 'marketing', slug: 'x', root }), /--area/);
    const registry = "'guide/probe-guide'";
    for (const file of created) {
      const raw = readFileSync(path.join(root, file), 'utf8');
      const problems = checkDoc(file, raw, { root, guideRegistry: registry }).filter((problem) => problem.key !== 'gateway');
      assert.deepEqual(problems, [], `${file}: ${JSON.stringify(problems)}`);
    }
    assert.ok(created.includes('docs/specs/2026-09-26-probe-spec.md'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a changed contract_version needs a new decision record that cites the contract', () => {
  const contract = (version) =>
    `---\ntitle: C\ndoc_type: contract\nstatus: current\narea: library\nstores: x\ncontract_version: ${version}\nenforced_by: [docs/README.md]\n---\n`;
  const root = fixture({ 'docs/README.md': '# r\n', 'docs/contracts/c.md': contract(1) });
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  const commit = (message) => {
    git('add', '.');
    git('-c', 'user.email=t@example.com', '-c', 'user.name=Probe', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', message);
  };
  try {
    git('init', '-q', '-b', 'main');
    commit('base');
    git('switch', '-q', '-c', 'bump');
    writeFileSync(path.join(root, 'docs/contracts/c.md'), contract(2));
    const docs = [{ repoPath: 'docs/contracts/c.md', frontmatter: { contract_version: 2 } }];
    assert.deepEqual(contractBumpProblems(docs, root).map((problem) => problem.key), ['contract_version']);
    mkdirSync(path.join(root, 'docs/records/decisions'), { recursive: true });
    writeFileSync(path.join(root, 'docs/records/decisions/2026-09-26-bump-x.md'), 'Raises docs/contracts/c.md to 2.\n');
    commit('bump with a decision');
    assert.deepEqual(contractBumpProblems(docs, root), []);
    // An unchanged version needs nothing.
    assert.deepEqual(contractBumpProblems([{ repoPath: 'docs/README.md', frontmatter: {} }], root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('doc:history follows a document back through every path it had', () => {
  assert.deepEqual(
    formerPaths('docs/c/new.md', { 'docs/OLD.md': 'docs/b/mid.md', 'docs/b/mid.md': 'docs/c/new.md' }),
    ['docs/c/new.md', 'docs/b/mid.md', 'docs/OLD.md'],
  );
  assert.deepEqual(formerPaths('docs/A.md', {}), ['docs/A.md']);
});

test('run reports problems with the file and the key', () => {
  const root = fixture({ 'docs/NOTE.md': '---\ntitle: Note\ndoc_type: authority\nstatus: current\n---\n' });
  try {
    const { checked, problems } = run(root);
    assert.equal(checked, 1);
    assert.deepEqual(problems.map(({ file, key }) => `${file}:${key}`), ['docs/NOTE.md:area']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
