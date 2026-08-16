// 내보내기가 **무엇을 안 담았는지** 말해야 한다.
//
// ## 왜 (2026-08-17 실측)
//
// `export --format jsonld` 는 이렇게 끝난다:
//
//   exported jsonld · 80 nodes · 174 edges · graphHash 0fbd9b66
//
// 노드와 관계는 정말 다 나간다(174 = 174, 확인함). 그런데 우리 볼트의
// **관계 이유 7개**(`relation_notes`)는 **하나도 안 나간다.** 구현 경로(`path`)
// 와 설명(`description`)도 마찬가지다.
//
// 이 저장소가 스스로 적어 둔 말이 있다: *"근거 없는 엣지는 마인드맵 선이지
// 온톨로지 주장이 아니다."* Protégé 나 트리플스토어로 옮긴 사람은 「80 노드 ·
// 174 관계」를 보고 온톨로지를 다 가져온 줄 안다 — 실제로는 이 제품을 이
// 제품이게 하는 것이 빠진 채다.
//
// 그래서 **payload 는 그대로 두고**(유효한 JSON-LD 여야 한다) 상태 줄이
// 말한다. `surfaces.md` 의 강등 규율과 같다: 못 하는 것은 못 한다고, 왜 그런지
// 함께.
//
// 판정은 **세어서** 한다. 목록을 손으로 적으면 스키마가 늘 때 조용히 낡는다.

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
  // 컴파일러가 붙이는 파생 칸(`mtime` 같은)을 「잃었다」고 하면, 상태 줄이
  // 매번 시끄러워지고 진짜 손실이 그 속에 묻힌다.
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
