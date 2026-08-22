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

test('내보낸 형식이 안 담는 칸을 이름으로 댄다', () => {
  const out = describeExportOmissions({
    nodes: [node({ path: 'src/x.ts', relation_notes: { 'a/b': '왜냐면' } })],
    carriedKeys: ['uid', 'slug', 'kind', 'title'],
  });
  assert.deepEqual(out.omitted.sort(), ['path', 'relation_notes']);
});

test('몇 개 노드가 그 값을 갖고 있는지도 센다 — 「있을 수도」와 「7개 있다」는 다르다', () => {
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

test('안 빠진 것은 말하지 않는다 — 없는 손실을 지어내지 않는다', () => {
  const out = describeExportOmissions({
    nodes: [node({ path: 'src/x.ts' })],
    carriedKeys: ['uid', 'slug', 'kind', 'title', 'path'],
  });
  assert.deepEqual(out.omitted, []);
  assert.equal(out.sentence, null);
});

test('빈 값은 손실이 아니다 — 비어 있는 칸을 잃었다고 하지 않는다', () => {
  const out = describeExportOmissions({
    nodes: [node({ path: '', relation_notes: {} })],
    carriedKeys: ['uid', 'slug', 'kind', 'title'],
  });
  assert.deepEqual(out.omitted, []);
});

test('사람이 읽는 한 줄을 준다', () => {
  const out = describeExportOmissions({
    nodes: [node({ relation_notes: { 'a/b': '왜냐면' } })],
    carriedKeys: ['uid', 'slug', 'kind', 'title'],
  });
  assert.match(out.sentence, /relation_notes/);
  assert.match(out.sentence, /1/);
});

test('노드가 없으면 아무 말도 안 한다', () => {
  const out = describeExportOmissions({ nodes: [], carriedKeys: ['uid'] });
  assert.deepEqual(out.omitted, []);
  assert.equal(out.sentence, null);
});

test('그래프 내부용 칸은 손실로 세지 않는다 — 사용자 데이터가 아니다', () => {
  // Reporting compiler-derived fields (`mtime` and the like) as "lost" makes the
  // status line noisy every time and buries the real losses in it.
  const out = describeExportOmissions({
    nodes: [node({ mtime: 123, filePath: '/abs/x.md' })],
    carriedKeys: ['uid', 'slug', 'kind', 'title'],
  });
  assert.deepEqual(out.omitted, []);
});

test('관계의 이유가 안 나가면 반드시 말한다 — 이 제품의 차이가 거기 있다', () => {
  const out = describeExportOmissions({
    nodes: [node({})],
    edges: [{ from: 'a', to: 'b', rationale: '고객이 결제를 되돌릴 수 있어야 해서' }, { from: 'c', to: 'd' }],
    carriedKeys: ['uid', 'slug', 'kind', 'title'],
  });
  assert.equal(out.counts['relation rationale'], 1);
  assert.match(out.sentence, /rationale/);
});

test('형식이 이유를 담으면 말하지 않는다', () => {
  const out = describeExportOmissions({
    nodes: [node({})],
    edges: [{ from: 'a', to: 'b', rationale: '왜' }],
    carriedKeys: ['uid', 'slug', 'kind', 'title'],
    carriesEdgeRationale: true,
  });
  assert.deepEqual(out.omitted, []);
});

test('원본 그대로인 형식은 이유도 안 따진다', () => {
  const out = describeExportOmissions({
    nodes: [node({ path: 'x' })],
    edges: [{ from: 'a', to: 'b', rationale: '왜' }],
    carriedKeys: null,
  });
  assert.deepEqual(out.omitted, []);
});
