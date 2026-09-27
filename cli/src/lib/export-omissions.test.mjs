// An export must state **what it did not carry**.
//
// **Why** (measured 2026-08-17): `export --format jsonld` ends like this:
//
//   exported jsonld · 80 nodes · 174 edges · graphHash 0fbd9b66
//
// Nodes and relations really do all go out (174 = 174, confirmed). But **none** of
// our vault's 7 relation rationales (`relation_notes`) go, and neither do the
// implementation paths (`path`) or the descriptions (`description`).
//
// This repository wrote the rule itself: *"an edge with no rationale is a mind-map
// line, not an ontology claim."* Someone moving to Protégé or a triplestore sees
// "80 nodes · 174 relations" and believes the whole ontology came across — while
// what makes this product this product is missing.
//
// So **the payload is left alone** (it must stay valid JSON-LD) and the status line
// says it. Same degradation discipline as `.claude/rules/surfaces.md`: say what
// cannot be done, and why.
//
// The verdict is reached **by counting**. A hand-written list rots silently as the
// schema grows.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { describeExportOmissions } from './export-omissions.mjs';

const node = (extra) => ({
  uid: 'a1',
  slug: 'capabilities/x',
  kind: 'capability',
  title: 'X',
  ...extra,
});

test('names the fields the export format drops', () => {
  const out = describeExportOmissions({
    nodes: [node({ path: 'src/x.ts', relation_notes: { 'a/b': '왜냐면' } })],
    carriedKeys: ['uid', 'slug', 'kind', 'title'],
  });
  assert.deepEqual(out.omitted.sort(), ['path', 'relation_notes']);
});

test('counts how many nodes carry each dropped field', () => {
  const out = describeExportOmissions({
    nodes: [
      node({ relation_notes: { 'a/b': '1' } }),
      node({ relation_notes: { 'c/d': '2' } }),
      node({}),
    ],
    carriedKeys: ['uid', 'slug', 'kind', 'title'],
  });
  assert.equal(out.counts.relation_notes, 2);
});

test('does not report fields the format keeps', () => {
  const out = describeExportOmissions({
    nodes: [node({ path: 'src/x.ts' })],
    carriedKeys: ['uid', 'slug', 'kind', 'title', 'path'],
  });
  assert.deepEqual(out.omitted, []);
  assert.equal(out.sentence, null);
});

test('does not count empty values as lost', () => {
  const out = describeExportOmissions({
    nodes: [node({ path: '', relation_notes: {} })],
    carriedKeys: ['uid', 'slug', 'kind', 'title'],
  });
  assert.deepEqual(out.omitted, []);
});

test('renders a one-line human summary', () => {
  const out = describeExportOmissions({
    nodes: [node({ relation_notes: { 'a/b': '왜냐면' } })],
    carriedKeys: ['uid', 'slug', 'kind', 'title'],
  });
  assert.match(out.sentence, /relation_notes/);
  assert.match(out.sentence, /1/);
});

test('reports nothing for an empty vault', () => {
  const out = describeExportOmissions({ nodes: [], carriedKeys: ['uid'] });
  assert.deepEqual(out.omitted, []);
  assert.equal(out.sentence, null);
});

test('does not count graph-internal fields as lost', () => {
  // Reporting compiler-derived fields (`mtime` and the like) as "lost" makes the
  // status line noisy every time and buries the real losses in it.
  const out = describeExportOmissions({
    nodes: [node({ mtime: 123, filePath: '/abs/x.md' })],
    carriedKeys: ['uid', 'slug', 'kind', 'title'],
  });
  assert.deepEqual(out.omitted, []);
});

test('reports relation reasons the format drops', () => {
  const out = describeExportOmissions({
    nodes: [node({})],
    edges: [{ from: 'a', to: 'b', rationale: '고객이 결제를 되돌릴 수 있어야 해서' }, { from: 'c', to: 'd' }],
    carriedKeys: ['uid', 'slug', 'kind', 'title'],
  });
  assert.equal(out.counts['relation rationale'], 1);
  assert.match(out.sentence, /rationale/);
});

test('does not report reasons the format keeps', () => {
  const out = describeExportOmissions({
    nodes: [node({})],
    edges: [{ from: 'a', to: 'b', rationale: '왜' }],
    carriedKeys: ['uid', 'slug', 'kind', 'title'],
    carriesEdgeRationale: true,
  });
  assert.deepEqual(out.omitted, []);
});

test('does not check reasons for a lossless format', () => {
  const out = describeExportOmissions({
    nodes: [node({ path: 'x' })],
    edges: [{ from: 'a', to: 'b', rationale: '왜' }],
    carriedKeys: null,
  });
  assert.deepEqual(out.omitted, []);
});
