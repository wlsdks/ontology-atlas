import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';

import { bodyMeaningFindings } from '../../meaning/meaning-findings.mjs';
import { extractUncertaintyReads } from '../../meaning/uncertainty-reads.mjs';
import { parseFrontmatter } from '../../parser.mjs';
import { validateVaultDocument } from '../../validate.mjs';
import {
  docBodyAnswer,
  docBodyIncluder,
  docBodyMeaningFindings,
  docUncertaintyReads,
  loadedDocIsEmpty,
  validateLoadedVaultDocument,
} from './doc-facts.mjs';
import { LINKS_UNINDEXED, bodyLinkKeys, evidenceSignature, linkIndexAnswers, linkKeysHold, signatureMayContain } from './doc-shape.mjs';
import {
  BODY_CACHE_MAX_BYTES,
  bodyCacheStats,
  cachedDocShape,
  createVaultDocCache,
  loadVaultDocs,
  PASS_TEXT_MAX_BYTES,
  RACY_WINDOW_MS,
  readVaultDocText,
  VaultDocChangedError,
} from './document-cache.mjs';
import { findBacklinks } from '../graph/graph-queries.mjs';

setFlagsFromString('--expose-gc');
const collect = runInNewContext('gc');

/** Heap bytes in use once everything unreachable is collected. */
function heapInUse() {
  collect();
  collect();
  return process.memoryUsage().heapUsed;
}

const MB = 1024 * 1024;

function makeVault(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'atlas-doc-facts-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(root, rel, '..'), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}

/** A cache whose load hands out no text, so every body below is read back from disk. */
function textlessDocs(root, clock = () => Date.now() + RACY_WINDOW_MS * 5) {
  return createVaultDocCache(root, { now: clock }).load({ keepTextBytes: 0 });
}

let uid = 0;
function node(kind, title, body, extra = '') {
  uid += 1;
  return `---\nuid: 00000000-0000-4000-8000-${String(uid).padStart(12, '0')}\nkind: ${kind}\ntitle: ${title}\n${extra}---\n${body}`;
}

/** The forms a body links by, and the near misses that must not count. */
const LINK_BODY = [
  'Uses [[elements/a]] and [[elements/b#Section]] and [[elements/c|the c]].',
  'Also [d](../elements/d.md), [e](elements/e.md#part), (f.md) and [[g]] [[g]].',
  'Not links: [[unclosed, [single] elements/h.md, [[x]y]], [[ spaced name ]], [[한글 노드]].',
  'Edge: [[]] [[#only]] [[|pipe]] (.md) /.md [[a\nb]] [[elements/i]]] [[[elements/j]]',
  `Long: [[${'k'.repeat(600)}]] and (${'l'.repeat(600)}.md)`,
].join('\n');

const FILES = {
  'empty.md': '',
  'plain.md': 'No frontmatter here, only [[elements/a]].\n',
  'unclosed.md': '---\nkind: capability\ntitle: Never closed\n\nBody without a closing fence.\n',
  'bom.md': `﻿${node('capability', 'With BOM', 'Defines it.\r\n\r\n## Includes\r\n- a\r\n')}`.replace(/\n/g, '\r\n'),
  'capabilities/thin.md': node('capability', 'Thin', 'TODO\n'),
  'capabilities/full.md': node('capability', 'Full', [
    'Lets a reader find the evidence for a claim without opening every file.',
    '',
    '## Includes',
    '- searching titles and bodies',
    '',
    '## Excludes',
    '- editing',
    '',
    '## Uncertainty',
    '- Not checked: how ranking treats [[elements/a]] when two titles tie.',
    '- The `src/search.ts` path was not read.',
    '',
  ].join('\n'), 'path: src/search.ts\n'),
  'elements/linky.md': node('element', 'Linky', LINK_BODY),
  'elements/korean.md': node('element', '한국어 요소', '이 요소는 근거를 찾는다.\n\n## 불확실성\n- 확인하지 못함.\n'),
  'domains/d.md': node('domain', 'Domain', 'A responsibility boundary.\n\n## Includes\n- x\n\n## Excludes\n- y\n'),
};

describe('answers the cache keeps per document', () => {
  it('equal the answers computed from the file text', (t) => {
    const root = makeVault(t, FILES);
    const docs = textlessDocs(root);
    assert.equal(docs.length, Object.keys(FILES).length);
    for (const doc of docs) {
      const raw = readFileSync(join(root, `${doc.slug}.md`), 'utf8');
      const { frontmatter, body, diagnostics } = parseFrontmatter(raw);
      const plain = { slug: doc.slug, frontmatter, body, raw, diagnostics, mtime: doc.mtime };
      const fields = { slug: doc.slug, kind: frontmatter.kind, title: frontmatter.title, path: frontmatter.path };
      assert.deepEqual(frontmatter, doc.frontmatter, doc.slug);
      assert.deepEqual(validateLoadedVaultDocument(doc, { slug: doc.slug }), validateVaultDocument(raw, { slug: doc.slug, parsed: plain }), doc.slug);
      assert.equal(loadedDocIsEmpty(doc), raw === '', doc.slug);
      assert.deepEqual(docBodyMeaningFindings(doc, fields), bodyMeaningFindings({ ...fields, body }), doc.slug);
      // Twice: the second answer comes from the memo.
      assert.deepEqual(docBodyMeaningFindings(doc, fields), bodyMeaningFindings({ ...fields, body }), doc.slug);
      assert.deepEqual(docUncertaintyReads(doc, fields), extractUncertaintyReads({ ...fields, body }), doc.slug);
      assert.deepEqual(docUncertaintyReads(doc, { ...fields, slug: 'renamed' }), extractUncertaintyReads({ ...fields, slug: 'renamed', body }), doc.slug);
      assert.equal(cachedDocShape(doc).links, bodyLinkKeys(body), doc.slug);
      assert.deepEqual(readVaultDocText(doc), { raw, body }, doc.slug);
    }
  });

  it('answer every link needle the way reading the body does', (t) => {
    const root = makeVault(t, FILES);
    const docs = textlessDocs(root);
    const doc = docs.find((d) => d.slug === 'elements/linky');
    const keys = cachedDocShape(doc).links;
    const bodyLinksTo = (body, needle) => [`[[${needle}]]`, `[[${needle}#`, `[[${needle}|`, `(${needle}.md`, `/${needle}.md`]
      .some((form) => body.includes(form));
    const needles = new Set(['elements/a', 'a', 'elements/b', 'elements/c', 'elements/d', 'd', '../elements/d', 'elements/e', 'e', 'f', 'g',
      'elements/h', 'h', 'x', ' spaced name ', '한글 노드', 'elements/i', 'elements/j', '[elements/j', '', 'k'.repeat(600), 'l'.repeat(600),
      'k'.repeat(512), 'l'.repeat(512), 'elements', 'unclosed, [single] elements/h', 'nothing']);
    for (let from = 0; from < LINK_BODY.length; from += 7) needles.add(LINK_BODY.slice(from, from + 9));
    let indexed = 0;
    for (const needle of needles) {
      const expected = bodyLinksTo(LINK_BODY, needle);
      if (linkIndexAnswers(keys, needle)) {
        indexed += 1;
        assert.equal(linkKeysHold(keys, needle), expected, JSON.stringify(needle));
      }
    }
    assert.ok(indexed > 20);
    for (const slug of ['elements/a', 'elements/b', 'elements/c', 'elements/d', 'elements/e', 'elements/h', 'elements/i', 'elements/j']) {
      const tail = slug.split('/').pop();
      const expected = Object.keys(FILES)
        .filter((rel) => rel !== `${slug}.md`)
        .filter((rel) => [slug, tail].some((needle) => bodyLinksTo(parseFrontmatter(FILES[rel]).body, needle)))
        .map((rel) => rel.replace(/\.md$/, ''))
        .sort();
      const found = findBacklinks(root, slug).filter((ref) => ref.matchedInBody).map((ref) => ref.slug).sort();
      assert.deepEqual(found, expected, slug);
    }
  });

  it('find_evidence\'s fingerprint never rules out text the body holds', (t) => {
    const root = makeVault(t, FILES);
    const docs = textlessDocs(root);
    let ruledOut = 0;
    for (const doc of docs) {
      const lowered = readVaultDocText(doc).body.toLowerCase();
      for (let from = 0; from + 3 <= lowered.length; from += 5) {
        assert.equal(signatureMayContain(cachedDocShape(doc).evidence, lowered.slice(from, from + 3 + (from % 11))), true, doc.slug);
      }
      if (!signatureMayContain(cachedDocShape(doc).evidence, 'zqxjv-never-written')) ruledOut += 1;
    }
    assert.ok(ruledOut >= docs.length - 2, `the fingerprint ruled out ${ruledOut} of ${docs.length}`);
  });

  it('keeps a per-version answer about the body, reading each body once', (t) => {
    const root = makeVault(t, FILES);
    const docs = textlessDocs(root);
    const test = (body) => body.length % 3;
    const expected = docs.map((doc) => test(parseFrontmatter(readFileSync(join(root, `${doc.slug}.md`), 'utf8')).body));
    assert.deepEqual(docs.map((doc) => docBodyAnswer(doc, 'length mod 3', test)), expected);
    for (const doc of docs) rmSync(join(root, `${doc.slug}.md`));
    assert.deepEqual(docs.map((doc) => docBodyAnswer(doc, 'length mod 3', test)), expected);
    // Another question about the same version reads the body again.
    assert.throws(() => docBodyAnswer(docs[0], 'length', (body) => body.length), VaultDocChangedError);
  });

  it('answers whether a body includes a needle as reading it does, and reads it once per needle', (t) => {
    const root = makeVault(t, FILES);
    const docs = textlessDocs(root);
    const needles = ['link', 'elements/a', 'the', 'zqxjv-never-written', 'body.', '한글'];
    const expected = needles.map((needle) => docs.map((doc) => readVaultDocText(doc).body.toLowerCase().includes(needle)));
    const before = bodyCacheStats();
    needles.forEach((needle, index) => {
      assert.deepEqual(docs.map(docBodyIncluder(needle)), expected[index], needle);
    });
    // The bodies read for these answers stayed out of the body cache.
    assert.deepEqual(bodyCacheStats(), before);
    // Asking a kept needle again reads no file: removing them all cannot change it.
    for (const doc of docs) rmSync(join(root, `${doc.slug}.md`));
    assert.deepEqual(docs.map(docBodyIncluder('body.')), expected[4]);
  });
});

describe('a cached document holds no file text', () => {
  it('keeps frontmatter and facts, not the text they were cut from', (t) => {
    const big = (i) => `${'근거를 찾는 문장이다. '.repeat(40_000)}[[elements/e${i + 1}]] ${i}\n`;
    const files = {};
    for (let i = 0; i < 40; i += 1) {
      files[`elements/e${i}.md`] = node('element', `A title long enough to be a slice of its file ${i}`, big(i), 'tags: [first-tag-of-this-file, second-tag-of-this-file]\n');
    }
    const root = makeVault(t, files);
    const textBytes = Object.values(files).reduce((sum, text) => sum + text.length * 2, 0);
    const before = heapInUse();
    const docs = textlessDocs(root);
    const held = heapInUse() - before;
    assert.equal(docs.length, 40);
    assert.ok(textBytes > 30 * MB);
    assert.ok(held < 2 * MB, `40 documents hold ${(held / MB).toFixed(1)} MB of heap for ${(textBytes / MB).toFixed(0)} MB of text`);
    assert.equal(Object.keys(docs[0]).includes('body'), false);
    assert.equal(Object.keys(docs[0]).includes('raw'), false);
  });

  it('serves a body read back only while the file still holds the bytes it parsed', (t) => {
    const root = makeVault(t, { 'elements/a.md': node('element', 'Before', 'Original body.\n') });
    const docs = textlessDocs(root);
    const file = join(root, 'elements/a.md');
    const { atime, mtime } = statSync(file);
    // Same size, same mtime: the stamp cannot show this edit, the bytes can.
    writeFileSync(file, readFileSync(file, 'utf8').replace('Original', 'Replaced'));
    utimesSync(file, atime, mtime);
    assert.throws(() => docs[0].body, (error) => error instanceof VaultDocChangedError && error.code === 'VAULT_CONFLICT');
    const [again] = loadVaultDocs(root);
    assert.equal(again.body, 'Replaced body.\n');
  });
});

describe('memory stays bounded on hostile input', () => {
  it('a frontmatter costs about its own size, linearly', (t) => {
    const held = (entries) => {
      const list = Array.from({ length: entries }, (_, i) => `  - capabilities/a-related-capability-with-a-long-name-${i}`).join('\n');
      const root = makeVault(t, { 'elements/huge.md': node('element', 'Huge', 'Body.\n', `depends_on:\n${list}\n`) });
      const text = readFileSync(join(root, 'elements/huge.md'), 'utf8');
      const before = heapInUse();
      const docs = textlessDocs(root);
      const bytes = heapInUse() - before;
      assert.equal(docs[0].frontmatter.depends_on.length, entries);
      return { bytes, textBytes: text.length * 2 };
    };
    const one = held(60_000);
    const two = held(120_000);
    assert.ok(one.bytes < one.textBytes * 2, `${(one.bytes / MB).toFixed(1)} MB for ${(one.textBytes / MB).toFixed(1)} MB of text`);
    const ratio = two.bytes / one.bytes;
    assert.ok(ratio > 1.5 && ratio < 2.5, `doubling the frontmatter multiplied what it holds by ${ratio.toFixed(2)}`);
  });

  it('a 100 MB body is never held: not by the cache, the pass or the body cache', (t) => {
    const root = makeVault(t, {
      'elements/small.md': node('element', 'Small', 'Small body.\n'),
    });
    writeFileSync(join(root, 'elements/huge.md'), node('element', 'Huge', `${'x'.repeat(100 * MB)}\n`));
    const before = heapInUse();
    let docs = loadVaultDocs(root);
    assert.equal(docs.length, 2);
    const afterPass = heapInUse() - before;
    assert.ok(afterPass < PASS_TEXT_MAX_BYTES + 2 * MB, `the pass hands out ${(afterPass / MB).toFixed(0)} MB`);
    const huge = docs.find((doc) => doc.slug === 'elements/huge');
    assert.equal(readVaultDocText(huge).body.length, 100 * MB + 1);
    assert.ok(bodyCacheStats().bytes <= BODY_CACHE_MAX_BYTES);
    docs = null;
    const held = heapInUse() - before;
    assert.ok(held < 2 * MB, `after the call the vault holds ${(held / MB).toFixed(1)} MB`);
  });

  it('the body cache keeps its budget however many bodies are read', (t) => {
    const files = {};
    for (let i = 0; i < 24; i += 1) files[`elements/e${i}.md`] = node('element', `E${i}`, `${'본문 '.repeat(500_000)}${i}\n`);
    const root = makeVault(t, files);
    const docs = textlessDocs(root);
    for (const doc of docs) {
      readVaultDocText(doc);
      assert.ok(bodyCacheStats().bytes <= BODY_CACHE_MAX_BYTES);
    }
    assert.ok(bodyCacheStats().entries < docs.length);
  });

  it('Korean files cost the same per file as the vault doubles', (t) => {
    const perFile = (count) => {
      const files = {};
      for (let i = 0; i < count; i += 1) {
        files[`elements/e${i}.md`] = node('element', `요소 ${i} 근거 경계`, `${'이 요소는 근거를 찾고 경계를 긋는다. '.repeat(60)}[[elements/e${i + 1}]]\n`, `display_ko: 요소 ${i}\n`);
      }
      const root = makeVault(t, files);
      const before = heapInUse();
      const docs = textlessDocs(root);
      const bytes = heapInUse() - before;
      assert.equal(docs.length, count);
      return bytes / count;
    };
    const one = perFile(1_000);
    const two = perFile(2_000);
    assert.ok(one < 2_048, `a 2.3 KB Korean file holds ${one.toFixed(0)} bytes`);
    assert.ok(two < one * 1.3, `per file: ${one.toFixed(0)} bytes at 1,000 files, ${two.toFixed(0)} at 2,000`);
  });
});

describe('time stays linear on hostile text', () => {
  // Each of these took about a second for 1 MB before the link walks were bounded.
  const HOSTILE = { 'repeated /a.md': '/a.md', 'repeated [': '[', 'repeated [[x#': '[[x#', 'repeated (a/b/c.md': '(a/b/c.md' };

  /** The best of three timings of indexing `body`, so a busy machine slows both sides alike. */
  const indexMs = (body) => Math.min(...[0, 1, 2].map(() => {
    const started = performance.now();
    bodyLinkKeys(body);
    evidenceSignature(body);
    return performance.now() - started;
  }));

  for (const [name, unit] of Object.entries(HOSTILE)) {
    it(`a 1 MB body of ${name} indexes about as fast as plain text`, () => {
      const plain = indexMs('plain text without any link. '.repeat(Math.ceil(MB / 29)));
      const hostile = indexMs(unit.repeat(Math.ceil(MB / unit.length)));
      // The budget allows eight units of work per character before a body gives up,
      // so up to about ten times plain text; unbounded they cost 60 to 400 times.
      assert.ok(hostile < plain * 20 + 50, `${hostile.toFixed(0)} ms against ${plain.toFixed(0)} ms for plain text`);
    });
  }

  it('a body past its link budget is read for every needle, and still answers', (t) => {
    const hostile = `See (elements/target.md) and [[elements/other]].\n${'/a.md'.repeat(200_000)}\n`;
    assert.equal(bodyLinkKeys(hostile), LINKS_UNINDEXED);
    const root = makeVault(t, {
      'elements/target.md': node('element', 'Target', 'Target body.\n'),
      'elements/other.md': node('element', 'Other', 'Other body.\n'),
      'elements/hostile.md': node('element', 'Hostile', hostile),
    });
    textlessDocs(root);
    assert.deepEqual(findBacklinks(root, 'elements/target').map((row) => row.slug), ['elements/hostile']);
    assert.deepEqual(findBacklinks(root, 'elements/other').map((row) => row.slug), ['elements/hostile']);
  });
});
