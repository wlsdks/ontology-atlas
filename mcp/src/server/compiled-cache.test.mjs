import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { compileOntology } from '../ontology-compiler.mjs';
import { createVaultDocCache, loadVaultDocs } from '../vault/documents.mjs';
import { createCompiledOntologyCache } from './compiled-cache.mjs';

const rawFor = (title) => `---\nuid: 11111111-1111-4111-8111-111111111111\nkind: capability\ntitle: ${title}\n---\n\nFixture.\n`;

function makeVault(t, title = 'Alpha') {
  const root = mkdtempSync(join(tmpdir(), 'atlas-compiled-cache-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'capabilities'));
  writeFileSync(join(root, 'capabilities/a.md'), rawFor(title));
  return root;
}

/** Version-keyed fake: each `loadDocs` returns a new array carrying the given version. */
function versioned() {
  const versions = new WeakMap();
  let version = 'v1';
  return {
    set(next) { version = next; },
    loadDocs: () => { const docs = [{ slug: 'capabilities/a', raw: version }]; versions.set(docs, version); return docs; },
    versionOf: (docs) => versions.get(docs),
  };
}

describe('createCompiledOntologyCache', () => {
  it('reuses the artifact while the stamp-set version holds, and recompiles when it moves', () => {
    const source = versioned();
    let compilations = 0;
    const cache = createCompiledOntologyCache({ ...source, compile: (docs) => ({ raw: docs[0].raw, n: ++compilations }) });
    const first = cache.getWithDocs();
    const second = cache.getWithDocs();
    assert.equal(second.artifact, first.artifact);
    assert.notEqual(second.docs, first.docs, 'each call returns the docs of its own stamp pass');
    assert.deepEqual(cache.stats(), { hits: 1, misses: 1, cached: true });
    source.set('v2');
    const third = cache.get();
    assert.notEqual(third, first.artifact);
    assert.equal(third.raw, 'v2');
    assert.equal(compilations, 2);
  });

  it('separates indexed and non-indexed artifacts', () => {
    const source = versioned();
    let compilations = 0;
    const cache = createCompiledOntologyCache({ ...source, compile: (_docs, options) => ({ options, n: ++compilations }) });
    const indexed = cache.get({ includeIndexes: true });
    const plain = cache.get({ includeIndexes: false });
    assert.notEqual(indexed, plain);
    assert.equal(compilations, 2);
  });

  it('drops every view of the old version once the version moves', () => {
    const source = versioned();
    const cache = createCompiledOntologyCache({ ...source, compile: (docs, view) => ({ raw: docs[0].raw, view }) });
    cache.get({ summary: true });
    cache.get();
    source.set('v2');
    assert.equal(cache.get().raw, 'v2');
    assert.equal(cache.get({ summary: true }).raw, 'v2', 'a view compiled for v1 must not answer for v2');
  });

  it('collects garbage after a compile of many nodes, never on a hit or a graph of few', () => {
    let collections = 0;
    const collectGarbage = () => { collections += 1; };
    const large = Array.from({ length: 5000 }, (_, index) => ({ slug: `capabilities/n${index}`, frontmatter: { kind: 'capability' } }));
    const versions = new WeakMap();
    const loadDocs = () => { const docs = large.slice(); versions.set(docs, 'v1'); return docs; };
    const cache = createCompiledOntologyCache({ loadDocs, compile: () => ({}), versionOf: (docs) => versions.get(docs), collectGarbage });
    cache.get();
    cache.get();
    assert.equal(collections, 1);
    const plain = large.map(({ slug }, index) => (index === 0 ? { slug, frontmatter: { kind: 'capability' } } : { slug }));
    const fewNodes = createCompiledOntologyCache({ loadDocs: () => plain, compile: () => ({}), collectGarbage });
    fewNodes.get();
    assert.equal(collections, 1);
  });

  it('can be cleared after explicit write paths', () => {
    const source = versioned();
    let compilations = 0;
    const cache = createCompiledOntologyCache({ ...source, compile: () => ({ n: ++compilations }) });
    const first = cache.get();
    cache.clear();
    assert.notEqual(cache.get(), first);
    assert.equal(compilations, 2);
  });

  it('compiles a caller-built array every time, since it has no stamp set', () => {
    let compilations = 0;
    const cache = createCompiledOntologyCache({ loadDocs: () => [], compile: (docs) => ({ raw: docs[0].raw, n: ++compilations }) });
    const docs = [{ slug: 'capabilities/a', raw: 'one' }];
    const first = cache.get({ docs });
    docs[0].raw = 'two';
    const second = cache.get({ docs });
    assert.equal(second.raw, 'two');
    assert.notEqual(second, first);
    assert.deepEqual(cache.stats(), { hits: 0, misses: 2, cached: false });
  });
});

describe('compiled cache over the vault document cache', () => {
  it('serves a hit while files are unchanged and recompiles after an edit', (t) => {
    const root = makeVault(t);
    const cache = createCompiledOntologyCache({ loadDocs: () => loadVaultDocs(root), compile: compileOntology });
    const before = cache.get();
    assert.equal(cache.get(), before);
    writeFileSync(join(root, 'capabilities/a.md'), rawFor('Alpha renamed'));
    const after = cache.get();
    assert.equal(after.nodes[0].title, 'Alpha renamed');
  });

  it('recompiles a same-size edit that kept its whole-second mtime', (t) => {
    const root = makeVault(t, 'AAf');
    const path = join(root, 'capabilities/a.md');
    utimesSync(path, 1_700_000_000, 1_700_000_000);
    const before = statSync(path);
    const docs = createVaultDocCache(root, { now: () => Date.now() + 10_000 });
    const cache = createCompiledOntologyCache({ loadDocs: docs.load, compile: compileOntology });
    const first = cache.get();
    assert.equal(first.nodes[0].title, 'AAf');
    assert.equal(cache.get(), first);
    writeFileSync(path, rawFor('AFA'));
    utimesSync(path, 1_700_000_000, 1_700_000_000);
    assert.equal(statSync(path).mtimeMs, before.mtimeMs);
    assert.equal(cache.get().nodes[0].title, 'AFA');
  });
});
