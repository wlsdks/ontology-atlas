import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import { parseFrontmatter } from './parser.mjs';
import { compileOntology } from './ontology-compiler.mjs';
import { createCompiledOntologyCache } from './compiled-cache.mjs';

function doc(slug, mtime = 1, raw = '---\nkind: capability\n---\n') {
  return { slug, mtime, raw };
}

describe('createCompiledOntologyCache', () => {
  it('returns freshly loaded documents with cached artifacts and detects changed bytes at the same mtime', () => {
    let current = doc('capabilities/a', 1, 'old bytes');
    let loads = 0;
    let compilations = 0;
    let compiledDocs;
    const cache = createCompiledOntologyCache({
      loadDocs: () => { loads += 1; return [structuredClone(current)]; },
      compile: (docs) => {
        compilations += 1;
        compiledDocs = docs;
        return { raw: docs[0].raw };
      },
    });
    const first = cache.getWithDocs();
    assert.equal(first.docs, compiledDocs);
    first.docs[0].raw = 'caller mutation';
    const second = cache.getWithDocs();
    assert.equal(second.artifact, first.artifact);
    assert.notEqual(second.docs, first.docs);
    assert.equal(second.docs[0].raw, 'old bytes');
    assert.equal(loads, 2);
    assert.equal(compilations, 1);

    current = { ...current, raw: 'new bytes' };
    const third = cache.getWithDocs();
    assert.equal(third.docs[0].mtime, first.docs[0].mtime);
    assert.notEqual(third.artifact, first.artifact);
    assert.equal(third.artifact.raw, 'new bytes');
    assert.equal(loads, 3);
    assert.equal(compilations, 2);
  });

  it('reuses a compiled artifact while the vault document signature is unchanged', () => {
    let compileCount = 0;
    let docs = [doc('capabilities/a')];
    const cache = createCompiledOntologyCache({
      loadDocs: () => docs,
      compile: (loadedDocs, options) => {
        compileCount += 1;
        return { compileCount, loadedDocs, options };
      },
    });

    const first = cache.get({ includeIndexes: true });
    const second = cache.get({ includeIndexes: true });

    assert.equal(first, second);
    assert.equal(compileCount, 1);
    assert.deepEqual(cache.stats(), { hits: 1, misses: 1, cached: true });

    docs = [doc('capabilities/a', 2)];
    const third = cache.get({ includeIndexes: true });

    assert.notEqual(third, first);
    assert.equal(compileCount, 2);
    assert.deepEqual(cache.stats(), { hits: 1, misses: 2, cached: true });

    docs = [doc('capabilities/a', 2, '---\nkind: domain\n---\n')];
    const fourth = cache.get({ includeIndexes: true });

    assert.notEqual(fourth, third);
    assert.equal(compileCount, 3);
    assert.deepEqual(cache.stats(), { hits: 1, misses: 3, cached: true });
  });

  it('separates indexed and non-indexed artifacts', () => {
    let compileCount = 0;
    const docs = [doc('capabilities/a')];
    const cache = createCompiledOntologyCache({
      loadDocs: () => docs,
      compile: (_loadedDocs, options) => {
        compileCount += 1;
        return { compileCount, options };
      },
    });

    const indexed = cache.get({ includeIndexes: true });
    const plain = cache.get({ includeIndexes: false });

    assert.notEqual(indexed, plain);
    assert.equal(compileCount, 2);
    assert.deepEqual(cache.stats(), { hits: 0, misses: 2, cached: true });
  });

  it('can be cleared after explicit write paths', () => {
    let compileCount = 0;
    const docs = [doc('capabilities/a')];
    const cache = createCompiledOntologyCache({
      loadDocs: () => docs,
      compile: () => ({ compileCount: ++compileCount }),
    });

    const first = cache.get({ includeIndexes: true });
    cache.clear();
    const second = cache.get({ includeIndexes: true });

    assert.notEqual(first, second);
    assert.equal(compileCount, 2);
    assert.deepEqual(cache.stats(), { hits: 0, misses: 2, cached: true });
  });
});

it('recompiles changed titles whose previous fingerprints collide at the same mtime', () => {
  const rawFor = (title) => `---\nuid: 11111111-1111-4111-8111-111111111111\nkind: capability\ntitle: ${title}\n---\n\nFixture.\n`;
  let raw = rawFor('AAf');
  const cache = createCompiledOntologyCache({
    loadDocs: () => {
      const parsed = parseFrontmatter(raw);
      return [{ slug: 'capabilities/change', mtime: 1, raw, frontmatter: parsed.frontmatter, body: parsed.body }];
    },
    compile: compileOntology,
  });
  const before = cache.get();
  assert.equal(before.nodes[0].title, 'AAf');
  raw = rawFor('AFA');
  const after = cache.get();
  assert.equal(after.nodes[0].title, 'AFA');
  assert.notEqual(after, before);
});

it('distinguishes every JavaScript code unit in explicitly supplied raw documents', () => {
  const cache = createCompiledOntologyCache({ loadDocs: () => [], compile: (docs) => ({ raw: docs[0].raw }) });
  const before = cache.get({ docs: [doc('capabilities/a', 1, '\ud800')] });
  const after = cache.get({ docs: [doc('capabilities/a', 1, '\ufffd')] });
  assert.notEqual(after, before);
  assert.equal(after.raw, '\ufffd');
});

it('keeps document boundaries distinct even when supplied keys contain separators', () => {
  const cache = createCompiledOntologyCache({ loadDocs: () => [], compile: (docs) => ({ slug: docs[0].slug }) });
  const first = cache.get({ docs: [doc('a\0b', 'c', 'd')] });
  const second = cache.get({ docs: [doc('a', 'b\0c', 'd')] });
  assert.notEqual(second, first);
  assert.equal(second.slug, 'a');
});

it('reuses reordered document sets without confusing duplicate slug claims', () => {
  const cache = createCompiledOntologyCache({ loadDocs: () => [], compile: (docs) => ({ count: docs.length }) });
  const docs = [doc('a', 1, 'first'), doc('a', 1, 'second'), doc('b', 2, 'third')];
  const first = cache.get({ docs });
  assert.equal(cache.get({ docs: [...docs].reverse() }), first);
  assert.notEqual(cache.get({ docs: [docs[0], docs[0], docs[2]] }), first);
});
