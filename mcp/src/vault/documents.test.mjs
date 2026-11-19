import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import fs, {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { applyAllOrNothing, VaultConflictError, writeFileAtomically } from './atomic-writes.mjs';
import { patchFrontmatter } from './doc-writes.mjs';
import { createCompiledOntologyCache } from '../server/compiled-cache.mjs';
import { compileOntology } from '../ontology-compiler.mjs';
import {
  createVaultDocCache,
  loadVaultDocs,
  RACY_WINDOW_MS,
  readDoc,
  vaultDocsVersion,
  withVaultReadSnapshot,
} from './documents.mjs';

let uidSequence = 0;
function nodeText(title, extra = '') {
  uidSequence += 1;
  const uid = `00000000-0000-4000-8000-${String(uidSequence).padStart(12, '0')}`;
  return `---\nuid: ${uid}\nkind: capability\ntitle: ${title}\n---\n\nThe ${title} capability.${extra}\n`;
}

function makeVault(t, files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'atlas-doc-cache-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'capabilities'));
  for (const [slug, text] of Object.entries(files)) writeFileSync(join(root, `${slug}.md`), text);
  return root;
}

/** Seconds since the epoch with no fraction, so restoring it restores `mtimeMs` exactly. */
const WHOLE_SECOND = 1_700_000_000;

/** A clock far enough ahead that files written by the test are no longer racy. */
const later = () => Date.now() + RACY_WINDOW_MS * 5;

function titles(docs) {
  return Object.fromEntries(docs.map((doc) => [doc.slug, doc.frontmatter.title]));
}

describe('vault document cache', () => {
  it('sees an external edit made between two calls', (t) => {
    const root = makeVault(t, { 'capabilities/a': nodeText('Alpha') });
    const cache = createVaultDocCache(root, { now: later });
    assert.equal(titles(cache.load())['capabilities/a'], 'Alpha');
    writeFileSync(join(root, 'capabilities/a.md'), nodeText('Alpha edited elsewhere'));
    assert.equal(titles(cache.load())['capabilities/a'], 'Alpha edited elsewhere');
  });

  it('sees a same-size edit whose whole-second mtime was put back (only ctime moves)', (t) => {
    const root = makeVault(t, { 'capabilities/a': nodeText('AAAA') });
    const path = join(root, 'capabilities/a.md');
    utimesSync(path, WHOLE_SECOND, WHOLE_SECOND);
    const before = statSync(path);
    const cache = createVaultDocCache(root, { now: later });
    assert.equal(titles(cache.load())['capabilities/a'], 'AAAA');
    writeFileSync(path, readFileSync(path, 'utf8').replace('AAAA', 'BBBB'));
    utimesSync(path, WHOLE_SECOND, WHOLE_SECOND);
    const after = statSync(path);
    assert.deepEqual([after.mtimeMs, after.size, after.ino], [before.mtimeMs, before.size, before.ino]);
    assert.equal(titles(cache.load())['capabilities/a'], 'BBBB');
  });

  for (const field of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    it(`sees an edit that moved only the stamp's ${field}`, (t) => {
      const root = makeVault(t, { 'capabilities/a': nodeText('AAAA') });
      const path = join(root, 'capabilities/a.md');
      const base = statSync(path);
      let current = { ...base, isFile: () => true };
      const stat = (filePath) => (filePath === path ? current : statSync(filePath));
      const readSnapshot = (filePath) => ({ raw: readFileSync(filePath, 'utf8'), stats: stat(filePath) });
      const cache = createVaultDocCache(root, { stat, readSnapshot, now: later });
      assert.equal(titles(cache.load())['capabilities/a'], 'AAAA');
      writeFileSync(path, readFileSync(path, 'utf8').replace('AAAA', 'BBBB'));
      current = { ...current, [field]: base[field] + 1 };
      assert.equal(titles(cache.load())['capabilities/a'], 'BBBB');
    });
  }

  it('compares bytes for a racy entry whose stamp the filesystem left unchanged', (t) => {
    const root = makeVault(t, { 'capabilities/a': nodeText('AAAA') });
    const path = join(root, 'capabilities/a.md');
    const frozenStat = statSync(path);
    // A coarse clock: the second write keeps size, mtime, ctime and inode.
    const stat = (filePath) => (filePath === path ? frozenStat : statSync(filePath));
    const readSnapshot = (filePath) => ({ raw: readDocRaw(root, filePath), stats: stat(filePath) });
    const cache = createVaultDocCache(root, { stat, readSnapshot, now: () => frozenStat.mtimeMs + 500 });
    assert.equal(titles(cache.load())['capabilities/a'], 'AAAA');
    writeFileSync(path, readDocRaw(root, path).replace('AAAA', 'BBBB'));
    assert.equal(titles(cache.load())['capabilities/a'], 'BBBB');
  });

  it('trusts an unchanged stamp once the read is outside the racy window', (t) => {
    const root = makeVault(t, { 'capabilities/a': nodeText('Alpha'), 'capabilities/b': nodeText('Beta') });
    const cache = createVaultDocCache(root, { now: later });
    const first = cache.load();
    const readsAfterFirst = cache.stats().reads;
    const second = cache.load();
    assert.equal(cache.stats().reads, readsAfterFirst);
    assert.notEqual(second, first);
    assert.equal(vaultDocsVersion(second), vaultDocsVersion(first));
    assert.deepEqual(second.map((doc) => doc.slug).sort(), first.map((doc) => doc.slug).sort());
    assert.ok(second.every((doc, index) => doc === first[index]));
  });

  it('re-reads a racy file each call until it settles, then stops', (t) => {
    const root = makeVault(t, { 'capabilities/a': nodeText('Alpha') });
    const mtime = statSync(join(root, 'capabilities/a.md')).mtimeMs;
    let clock = mtime + 100;
    const cache = createVaultDocCache(root, { now: () => clock });
    const first = cache.load();
    cache.load();
    assert.equal(cache.stats().reads, 2);
    assert.equal(cache.stats().generation, 1, 'equal bytes do not change the version');
    clock = mtime + RACY_WINDOW_MS + 1000;
    cache.load();
    assert.equal(cache.stats().reads, 3, 'the read that leaves the window is the last');
    const settled = cache.load();
    assert.equal(cache.stats().reads, 3);
    assert.equal(settled[0], first[0]);
  });

  it('serves a write made while the vault is cached on the next call', (t) => {
    const root = makeVault(t, { 'capabilities/a': nodeText('Alpha') });
    assert.equal(titles(loadVaultDocs(root))['capabilities/a'], 'Alpha');
    patchFrontmatter(root, 'capabilities/a', { title: 'Alpha patched' });
    assert.equal(titles(loadVaultDocs(root))['capabilities/a'], 'Alpha patched');
  });

  it('follows a rename and drops the old path', (t) => {
    const root = makeVault(t, { 'capabilities/a': nodeText('Alpha') });
    const cache = createVaultDocCache(root, { now: later });
    const before = cache.load();
    renameSync(join(root, 'capabilities/a.md'), join(root, 'capabilities/renamed.md'));
    const after = cache.load();
    assert.deepEqual(after.map((doc) => doc.slug), ['capabilities/renamed']);
    assert.notEqual(vaultDocsVersion(after), vaultDocsVersion(before));
    assert.equal(cache.stats().files, 1);
  });

  it('drops a deleted file', (t) => {
    const root = makeVault(t, { 'capabilities/a': nodeText('Alpha'), 'capabilities/b': nodeText('Beta') });
    const cache = createVaultDocCache(root, { now: later });
    const before = cache.load();
    unlinkSync(join(root, 'capabilities/a.md'));
    const after = cache.load();
    assert.deepEqual(after.map((doc) => doc.slug), ['capabilities/b']);
    assert.notEqual(vaultDocsVersion(after), vaultDocsVersion(before));
    assert.equal(cache.stats().files, 1);
  });

  it('skips a file deleted between the walk and the read', (t) => {
    const root = makeVault(t, { 'capabilities/a': nodeText('Alpha'), 'capabilities/b': nodeText('Beta') });
    const gone = join(root, 'capabilities/a.md');
    const cache = createVaultDocCache(root, {
      walk: () => {
        const files = readdirSync(join(root, 'capabilities')).map((name) => join(root, 'capabilities', name));
        unlinkSync(gone);
        return files;
      },
    });
    assert.deepEqual(cache.load().map((doc) => doc.slug), ['capabilities/b']);
  });

  it('moves the version even when a pass throws after replacing an entry', (t) => {
    const root = makeVault(t, { 'capabilities/a': nodeText('Alpha'), 'capabilities/b': nodeText('Beta') });
    const a = join(root, 'capabilities/a.md');
    const b = join(root, 'capabilities/b.md');
    let failB = false;
    const cache = createVaultDocCache(root, {
      walk: () => [a, b],
      now: later,
      stat: (filePath) => {
        if (failB && filePath === b) throw Object.assign(new Error('unreadable'), { code: 'EACCES' });
        return statSync(filePath);
      },
    });
    const before = vaultDocsVersion(cache.load());
    appendFileSync(a, '\nEdited.\n');
    failB = true;
    assert.throws(() => cache.load(), /unreadable/);
    failB = false;
    const after = cache.load();
    assert.ok(after.find((doc) => doc.slug === 'capabilities/a').body.includes('Edited.'));
    assert.notEqual(vaultDocsVersion(after), before, 'the entry replaced before the throw must not hide under the old version');
  });

  it('re-reads exactly the files of a 5,000-file burst', (t) => {
    const files = {};
    for (let i = 0; i < 6000; i += 1) files[`capabilities/n-${i}`] = nodeText(`Node ${i}`);
    const root = makeVault(t, files);
    const cache = createVaultDocCache(root, { now: later });
    const before = cache.load();
    assert.equal(before.length, 6000);
    const readsBefore = cache.stats().reads;
    for (let i = 0; i < 5000; i += 1) appendFileSync(join(root, `capabilities/n-${i}.md`), `\nBurst ${i}.\n`);
    const after = cache.load();
    assert.equal(cache.stats().reads - readsBefore, 5000);
    const bySlug = new Map(after.map((doc) => [doc.slug, doc]));
    for (let i = 0; i < 6000; i += 1) {
      const doc = bySlug.get(`capabilities/n-${i}`);
      assert.equal(doc.body.includes(`Burst ${i}.`), i < 5000, `n-${i}`);
    }
  });

  it('never loads the temp file our atomic writer renames into place', (t) => {
    const root = makeVault(t, { 'capabilities/a': nodeText('Alpha') });
    const path = join(root, 'capabilities/a.md');
    writeFileSync(`${path}.oatlas-tmp-${process.pid}`, nodeText('Half written'));
    assert.deepEqual(loadVaultDocs(root).map((doc) => doc.slug), ['capabilities/a']);
    rmSync(`${path}.oatlas-tmp-${process.pid}`);
    writeFileAtomically(path, nodeText('Alpha rewritten'));
    assert.deepEqual(titles(loadVaultDocs(root)), { 'capabilities/a': 'Alpha rewritten' });
  });

  it('a cached mtime cannot carry a write over a newer edit on disk', (t) => {
    const root = makeVault(t, { 'capabilities/a': nodeText('Alpha') });
    const path = join(root, 'capabilities/a.md');
    const cached = loadVaultDocs(root).find((doc) => doc.slug === 'capabilities/a');
    writeFileSync(path, nodeText('Edited by a person'));
    utimesSync(path, new Date(), new Date(cached.mtime + 5000));
    assert.throws(
      () => patchFrontmatter(root, 'capabilities/a', { title: 'Agent write' }, { expectedMtime: cached.mtime }),
      VaultConflictError,
    );
    assert.equal(readDoc(root, path).frontmatter.title, 'Edited by a person');
  });

  it('a cached snapshot refuses a planned write when bytes changed under the same mtime', (t) => {
    const root = makeVault(t, { 'capabilities/a': nodeText('AAAA') });
    const path = join(root, 'capabilities/a.md');
    const cached = loadVaultDocs(root).find((doc) => doc.slug === 'capabilities/a');
    const sameSize = cached.raw.replace('AAAA', 'BBBB');
    writeFileSync(path, sameSize);
    utimesSync(path, new Date(), new Date(cached.mtime));
    assert.throws(
      () => applyAllOrNothing([{ op: 'write', path, content: 'replaced', expectedMtime: cached.mtime, expectedRaw: cached.raw }], { requireRevisions: true }),
      /changed on disk/,
    );
    assert.equal(readDocRaw(root, path), sameSize);
  });

  it('freezes shared docs so a caller cannot edit the next call\'s graph', (t) => {
    const root = makeVault(t, { 'capabilities/a': nodeText('Alpha') });
    const [doc] = loadVaultDocs(root);
    assert.throws(() => { doc.frontmatter.title = 'mutated'; }, TypeError);
    assert.throws(() => { doc.slug = 'other'; }, TypeError);
    const fresh = readDoc(root, join(root, 'capabilities/a.md'));
    fresh.frontmatter.title = 'a write may edit its own fresh copy';
    assert.equal(loadVaultDocs(root)[0].frontmatter.title, 'Alpha');
  });

  it('gives arrays it did not produce no version', () => {
    assert.equal(vaultDocsVersion([]), undefined);
    assert.equal(vaultDocsVersion(null), undefined);
  });
});

/**
 * A FAT-family volume: no ctime, and a same-size edit whose mtime is restored more
 * than 2 s later leaves every stamp field equal. Simulated by reporting the first
 * stamp of one file for as long as the test runs.
 */
function freezeStampOf(t, path) {
  const originalStat = fs.statSync;
  const originalFstat = fs.fstatSync;
  const first = originalStat(path);
  const frozen = Object.assign(Object.create(Object.getPrototypeOf(first)), first, { mtimeMs: 1e12, ctimeMs: 1e12 });
  const same = (stats) => stats && stats.ino === first.ino && stats.dev === first.dev;
  t.mock.method(fs, 'statSync', (...args) => { const stats = originalStat(...args); return same(stats) ? frozen : stats; });
  t.mock.method(fs, 'fstatSync', (...args) => { const stats = originalFstat(...args); return same(stats) ? frozen : stats; });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
}

/** What a read-only tool sees: the server runs those inside a read scope. */
const served = (root) => withVaultReadSnapshot(async () => loadVaultDocs(root));

describe('a stamp that cannot show an edit (FAT/exFAT)', () => {
  it('a read tool sees the stale parse only until a write path reads the file fresh', async (t) => {
    const root = makeVault(t, { 'capabilities/a': nodeText('AAAA') });
    const path = join(root, 'capabilities/a.md');
    freezeStampOf(t, path);
    await served(root);
    writeFileSync(path, readFileSync(path, 'utf8').replace('AAAA', 'BBBB'));
    assert.equal(titles(await served(root))['capabilities/a'], 'AAAA', 'the simulated volume hides the edit');
    assert.equal(readDoc(root, path).frontmatter.title, 'BBBB');
    assert.equal(titles(await served(root))['capabilities/a'], 'BBBB');
    patchFrontmatter(root, 'capabilities/a', { title: 'CCCC' });
    assert.equal(readDoc(root, path).frontmatter.title, 'CCCC');
  });

  it('outside a read tool every load compares bytes, so a write decides from the file', async (t) => {
    const root = makeVault(t, { 'capabilities/a': nodeText('AAAA') });
    const path = join(root, 'capabilities/a.md');
    freezeStampOf(t, path);
    const before = await served(root);
    writeFileSync(path, readFileSync(path, 'utf8').replace('AAAA', 'BBBB'));
    const fresh = loadVaultDocs(root);
    assert.equal(titles(fresh)['capabilities/a'], 'BBBB');
    assert.notEqual(vaultDocsVersion(fresh), vaultDocsVersion(before));
    assert.equal(titles(await served(root))['capabilities/a'], 'BBBB', 'the fresh pass also repairs the cache');
  });

  it('a fresh pass hands out the new mtime when only the time moved', (t) => {
    const root = makeVault(t, { 'capabilities/a': nodeText('AAAA') });
    const path = join(root, 'capabilities/a.md');
    utimesSync(path, WHOLE_SECOND, WHOLE_SECOND);
    const before = loadVaultDocs(root);
    utimesSync(path, WHOLE_SECOND + 60, WHOLE_SECOND + 60);
    const after = loadVaultDocs(root);
    assert.equal(after[0].mtime, (WHOLE_SECOND + 60) * 1000, 'expected_mtime must match the file');
    assert.notEqual(vaultDocsVersion(after), vaultDocsVersion(before));
  });

  it('a refused plan drops the stale parse, so the retry plans from the file', async (t) => {
    const root = makeVault(t, { 'capabilities/a': nodeText('AAAA') });
    const path = join(root, 'capabilities/a.md');
    freezeStampOf(t, path);
    await served(root);
    writeFileSync(path, readFileSync(path, 'utf8').replaceAll('AAAA', 'BBBB'));
    const plan = (doc) => [{ op: 'write', path, content: doc.raw.replace('The ', 'Then '), expectedMtime: doc.mtime, expectedRaw: doc.raw }];
    const stale = (await served(root)).find((doc) => doc.slug === 'capabilities/a');
    assert.equal(stale.frontmatter.title, 'AAAA');
    assert.throws(() => applyAllOrNothing(plan(stale), { requireRevisions: true }), /changed on disk/);
    const fresh = (await served(root)).find((doc) => doc.slug === 'capabilities/a');
    assert.equal(fresh.frontmatter.title, 'BBBB');
    applyAllOrNothing(plan(fresh), { requireRevisions: true });
    assert.match(readFileSync(path, 'utf8'), /title: BBBB[\s\S]*Then BBBB/);
  });

  // A slug resolves to NFC and to the case the agent typed; the walk returns the
  // name as stored. Only volumes that resolve both spellings to one file apply.
  for (const [label, stored, typed] of [
    ['an NFD Hangul name', '결제'.normalize('NFD'), '결제'],
    ['a name in another case', 'case', 'CASE'],
  ]) {
    it(`a fresh read through ${label} drops the entry the walk stored`, async (t) => {
      const root = makeVault(t);
      const path = join(root, 'capabilities', `${stored}.md`);
      writeFileSync(path, nodeText('AAAA'));
      const typedPath = join(root, 'capabilities', `${typed}.md`);
      if (!existsSync(typedPath) || statSync(typedPath).ino !== statSync(path).ino) {
        t.skip('this volume keeps the two spellings apart');
        return;
      }
      freezeStampOf(t, path);
      await served(root);
      writeFileSync(path, readFileSync(path, 'utf8').replaceAll('AAAA', 'BBBB'));
      // The stale parse is the cached frontmatter; the cache holds no text to show.
      assert.ok((await served(root)).some((doc) => doc.frontmatter.title === 'AAAA'));
      assert.equal(readDoc(root, typedPath).frontmatter.title, 'BBBB');
      assert.ok((await served(root)).every((doc) => !doc.raw.includes('AAAA')));
    });
  }

  it('a refused write then a delete leaves no version that still holds the file', (t) => {
    const root = makeVault(t, {
      'capabilities/x': nodeText('X'),
      'capabilities/keep': nodeText('Keep'),
      'capabilities/other': nodeText('Other'),
    });
    const path = join(root, 'capabilities/x.md');
    const graph = createCompiledOntologyCache({ loadDocs: () => loadVaultDocs(root), compile: compileOntology });
    const planned = loadVaultDocs(root).find((doc) => doc.slug === 'capabilities/x');
    assert.equal(graph.get({ summary: true }).nodeCount, 3);
    appendFileSync(path, '\nA person added this line.\n');
    assert.throws(() => patchFrontmatter(root, 'capabilities/x', { title: 'X by agent' }, { expectedMtime: planned.mtime }));
    unlinkSync(path);
    assert.equal(loadVaultDocs(root).length, 2);
    assert.equal(graph.get({ summary: true }).nodeCount, 2, 'the compiled graph must not keep the deleted file');
  });

  it('forget finds the entry by device and inode when the path is spelled differently', (t) => {
    const root = makeVault(t, { 'capabilities/a': nodeText('AAAA') });
    const path = join(root, 'capabilities/a.md');
    const cache = createVaultDocCache(root, { now: later });
    cache.load();
    const readsBefore = cache.stats().reads;
    assert.equal(cache.forget(join(root, 'Capabilities/A-other-spelling.md'), 'other bytes', statSync(path)), true);
    cache.load();
    assert.equal(cache.stats().reads, readsBefore + 1, 'the dropped file is read again');
    assert.equal(cache.forget(path, readFileSync(path, 'utf8')), false, 'equal bytes keep the entry');
  });
});

describe('a write decides from other files as they are on disk', () => {
  /**
   * Plants `depends_on: [capabilities/target]` in another node with a same-size
   * edit the volume's stamp cannot show, after a read tool has cached the vault,
   * then runs one lifecycle tool in a fresh process and reports what it did.
   */
  function plantedBacklinkRun(t, call) {
    const root = makeVault(t);
    const pad = 'note: xxxxxxxxxxxxxxxxxxxxxxxxxxx\n';
    const relation = 'depends_on: [capabilities/target]\n';
    assert.equal(pad.length, relation.length);
    const withExtra = (title, extra) => nodeText(title).replace('kind: capability\n', `kind: capability\n${extra}`);
    writeFileSync(join(root, 'capabilities/target.md'), nodeText('Target'));
    writeFileSync(join(root, 'capabilities/into.md'), nodeText('Into'));
    writeFileSync(join(root, 'capabilities/referrer.md'), withExtra('Referrer', pad));
    const modules = Object.fromEntries(['./documents.mjs', './graph-queries.mjs', '../tools/lifecycle.mjs']
      .map((path) => [path, new URL(path, import.meta.url).href]));
    const script = `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      const root = process.env.OATLAS_VAULT;
      const referrer = root + '/capabilities/referrer.md';
      const first = fs.statSync(referrer);
      const frozen = Object.assign(Object.create(Object.getPrototypeOf(first)), first, { mtimeMs: 1e12, ctimeMs: 1e12 });
      const same = (stats) => stats && stats.ino === first.ino && stats.dev === first.dev;
      for (const name of ['statSync', 'fstatSync']) {
        const original = fs[name];
        fs[name] = (...args) => { const stats = original(...args); return same(stats) ? frozen : stats; };
      }
      syncBuiltinESMExports();
      const { withVaultReadSnapshot } = await import(${JSON.stringify(modules['./documents.mjs'])});
      const { findBacklinks } = await import(${JSON.stringify(modules['./graph-queries.mjs'])});
      const lifecycle = await import(${JSON.stringify(modules['../tools/lifecycle.mjs'])});
      const primed = await withVaultReadSnapshot(async () => findBacklinks(root, 'capabilities/target').length);
      fs.writeFileSync(referrer, fs.readFileSync(referrer, 'utf8').replace(${JSON.stringify(pad)}, ${JSON.stringify(relation)}));
      let outcome;
      try { lifecycle.${call}; outcome = 'done'; } catch (error) { outcome = 'refused: ' + error.message.split('\\n')[0]; }
      console.log(JSON.stringify({ primed, outcome, referrer: fs.readFileSync(referrer, 'utf8'),
        targetExists: fs.existsSync(root + '/capabilities/target.md') }));
    `;
    return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8', env: { ...process.env, OATLAS_VAULT: root, OATLAS_REPO_ROOT: root },
    }));
  }

  it('delete_concept refuses a target another file now references', (t) => {
    const run = plantedBacklinkRun(t, "deleteConcept({ slug: 'capabilities/target', confirm: true })");
    assert.equal(run.primed, 0);
    assert.match(run.outcome, /^refused/);
    assert.equal(run.targetExists, true);
  });

  it('rename_concept rewrites a reference another file just gained', (t) => {
    const run = plantedBacklinkRun(t, "renameConcept({ oldSlug: 'capabilities/target', newSlug: 'capabilities/renamed', confirm: true })");
    assert.equal(run.outcome, 'done');
    assert.match(run.referrer, /depends_on: \[capabilities\/renamed\]/);
  });

  it('merge_concepts rewrites a reference another file just gained', (t) => {
    const run = plantedBacklinkRun(t, "mergeConcepts({ fromSlug: 'capabilities/target', intoSlug: 'capabilities/into', confirm: true })");
    assert.equal(run.outcome, 'done');
    assert.match(run.referrer, /depends_on: \[capabilities\/into\]/);
  });
});

describe('listing order', () => {
  /** find_path's reply with every directory listing in the order given; a fresh process each time. */
  function findPathReply(root, reverse) {
    const readModule = new URL('../tools/read.mjs', import.meta.url).href;
    const script = `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      if (${reverse}) {
        const original = fs.readdirSync;
        fs.readdirSync = (...args) => original(...args).reverse();
        syncBuiltinESMExports();
      }
      const { findPathTool } = await import(${JSON.stringify(readModule)});
      console.log(JSON.stringify(findPathTool({ from: 'capabilities/start', to: 'elements/end' })));
    `;
    return execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8', env: { ...process.env, OATLAS_VAULT: root, OATLAS_REPO_ROOT: root },
    });
  }

  it('gives find_path the same reply whatever order the directories are listed in', (t) => {
    // Two equally short paths, start → via-a → end and start → via-b → end; the
    // breadth-first search takes whichever neighbour the listing yields first.
    const root = makeVault(t, {
      'capabilities/start': nodeText('Start'),
      'capabilities/via-a': nodeText('Via A').replace('kind: capability', 'kind: capability\ndepends_on: [capabilities/start, elements/end]'),
      'capabilities/via-b': nodeText('Via B').replace('kind: capability', 'kind: capability\ndepends_on: [capabilities/start, elements/end]'),
    });
    mkdirSync(join(root, 'elements'));
    writeFileSync(join(root, 'elements/end.md'), nodeText('End').replace('kind: capability', 'kind: element'));
    const listed = findPathReply(root, false);
    assert.equal(JSON.parse(listed).found, true);
    assert.equal(findPathReply(root, true), listed);
  });
});

describe('read snapshot scope', () => {
  it('shares one stamp pass across a read call, including its awaits', async (t) => {
    const root = makeVault(t, { 'capabilities/a': nodeText('Alpha') });
    const path = join(root, 'capabilities/a.md');
    await withVaultReadSnapshot(async () => {
      const first = loadVaultDocs(root);
      writeFileSync(path, nodeText('Edited during the read'));
      await Promise.resolve();
      const second = loadVaultDocs(root);
      assert.notEqual(second, first);
      assert.equal(vaultDocsVersion(second), vaultDocsVersion(first));
      assert.equal(titles(second)['capabilities/a'], 'Alpha');
    });
    assert.equal(titles(loadVaultDocs(root))['capabilities/a'], 'Edited during the read');
  });

  it('does not reach a concurrent call outside the scope, such as a write', async (t) => {
    const root = makeVault(t, { 'capabilities/a': nodeText('Alpha') });
    let release;
    const gate = new Promise((resolveGate) => { release = resolveGate; });
    const reading = withVaultReadSnapshot(async () => {
      loadVaultDocs(root);
      await gate;
      return titles(loadVaultDocs(root))['capabilities/a'];
    });
    patchFrontmatter(root, 'capabilities/a', { title: 'Written meanwhile' });
    assert.equal(titles(loadVaultDocs(root))['capabilities/a'], 'Written meanwhile');
    release();
    assert.equal(await reading, 'Alpha');
  });

  it('closes when the call settles, so work it left behind reads the disk', async (t) => {
    const root = makeVault(t, { 'capabilities/a': nodeText('Alpha') });
    let later;
    await withVaultReadSnapshot(async () => {
      loadVaultDocs(root);
      later = new Promise((resolveLater) => setTimeout(() => resolveLater(titles(loadVaultDocs(root))['capabilities/a']), 20));
    });
    writeFileSync(join(root, 'capabilities/a.md'), nodeText('After the call'));
    assert.equal(await later, 'After the call');
  });
});

function readDocRaw(root, path) {
  return readDoc(root, path).raw;
}
