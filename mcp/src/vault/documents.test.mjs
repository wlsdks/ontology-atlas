import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { applyAllOrNothing, VaultConflictError, writeFileAtomically } from './atomic-writes.mjs';
import { patchFrontmatter } from './doc-writes.mjs';
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

  it('sees a same-size edit whose mtime was put back within the same second', (t) => {
    const root = makeVault(t, { 'capabilities/a': nodeText('AAAA') });
    const path = join(root, 'capabilities/a.md');
    const before = statSync(path);
    const cache = createVaultDocCache(root);
    assert.equal(titles(cache.load())['capabilities/a'], 'AAAA');
    writeFileSync(path, readDocRaw(root, path).replace('AAAA', 'BBBB'));
    utimesSync(path, before.atime, before.mtime);
    assert.equal(statSync(path).size, before.size);
    assert.equal(titles(cache.load())['capabilities/a'], 'BBBB');
  });

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
