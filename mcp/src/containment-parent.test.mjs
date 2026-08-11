import assert from 'node:assert/strict';
import test from 'node:test';

import { parentedSlugs, suppressParentedExpectedFieldIssues } from './validate.mjs';

/**
 * **부모가 이미 있는 노드에 「부모가 없다」고 경고하지 않는다** (2026-08-11).
 *
 * ## 어디서 나왔나 — 북극성 여정을 실제로 걸어서
 *
 * `init --quick-start` 로 갓 만든 볼트가 **자기 검사기를 통과하지 못했다.** 경고는
 * 하나뿐인데(`missing-expected-field: domain`) 그 하나가 셋을 빨갛게 만들었다:
 * `health` exit 1 · `mcp-verify` exit 1(`vaultWarnings present`) · `agent-brief`
 * exit 1(`needs_shape 45/100`). 사람에게는 *"내가 뭘 잘못했나"* 이고, **에이전트에게는
 * 연결 실패 신호**다 — 실제로는 서버도 도구 35개도 정상이었다.
 *
 * 원인은 검사기가 **파일 하나만 보기 때문**이다. 그 경고의 문구 자체가
 * *"트리에서 부모를 찾을 수 있습니다"* 인데, 그 볼트의 프로젝트 노드는 이미
 * `contains: [capabilities/catalog, capabilities/checkout]` 로 그 둘을 담고 있었다.
 * **부모가 이미 있는데 부모가 없다고 말한 것이다.**
 *
 * ## 왜 도메인을 지어내지 않았나
 *
 * 분석기는 도메인을 **README 제목에서만** 얻는다. 제목이 없는 저장소에서 도메인을
 * 만들어 붙이는 것은 이 제품이 스스로 금한 일이다 — 분석기 자신의 문구가
 * *"source folder is implementation evidence, not proof of a shared capability
 * meaning"* 이고 *"README heading is a concept clue, not proof of a shared business
 * boundary"* 다. 없는 경계를 지어내는 대신, **이미 있는 부모를 인정한다.**
 *
 * 이 저장소의 계약과도 같은 방향이다: *"Project containment is implicit"* —
 * `projectIds` 는 포함을 따라 BFS 로 유도된다.
 *
 * ⚠️ **경고를 없애는 것이 아니라 좁히는 것이다.** 아무도 안 담은 역량에는 그대로
 * 남는다 — 그때는 진짜로 부모가 없다.
 */

const doc = (slug, frontmatter) => ({ slug, frontmatter });

test('containment parent · 프로젝트가 담은 역량은 부모가 있다', () => {
  const docs = [
    doc('shop', { kind: 'project', contains: ['capabilities/checkout', 'capabilities/catalog'] }),
    doc('capabilities/checkout', { kind: 'capability' }),
    doc('capabilities/catalog', { kind: 'capability' }),
  ];
  const parented = parentedSlugs(docs);
  assert.equal(parented.has('capabilities/checkout'), true);
  assert.equal(parented.has('capabilities/catalog'), true);
  assert.equal(parented.has('shop'), false, '아무도 프로젝트를 담지 않는다');
});

test('containment parent · 도메인의 capabilities 목록도 부모다', () => {
  const docs = [
    doc('domains/auth', { kind: 'domain', capabilities: ['capabilities/login'] }),
    doc('capabilities/login', { kind: 'capability' }),
  ];
  assert.equal(parentedSlugs(docs).has('capabilities/login'), true);
});

test('containment parent · 아무도 안 담으면 부모가 없다', () => {
  const docs = [
    doc('shop', { kind: 'project', contains: [] }),
    doc('capabilities/orphan', { kind: 'capability' }),
  ];
  assert.equal(parentedSlugs(docs).has('capabilities/orphan'), false);
});

test('suppress · 부모가 있으면 domain 누락 경고를 지운다', () => {
  const docs = [
    doc('shop', { kind: 'project', contains: ['capabilities/checkout'] }),
    doc('capabilities/checkout', { kind: 'capability' }),
  ];
  const issuesBySlug = new Map([
    [
      'capabilities/checkout',
      [{ code: 'missing-expected-field', severity: 'warning', message: '`domain:` 가 비어있습니다: …' }],
    ],
  ]);
  suppressParentedExpectedFieldIssues(issuesBySlug, docs);
  assert.deepEqual(issuesBySlug.get('capabilities/checkout'), []);
});

test('suppress · 부모가 없으면 그대로 남는다 — 그때는 진짜 결함이다', () => {
  const docs = [doc('capabilities/orphan', { kind: 'capability' })];
  const issuesBySlug = new Map([
    [
      'capabilities/orphan',
      [{ code: 'missing-expected-field', severity: 'warning', message: '`domain:` 가 비어있습니다: …' }],
    ],
  ]);
  suppressParentedExpectedFieldIssues(issuesBySlug, docs);
  assert.equal(issuesBySlug.get('capabilities/orphan').length, 1);
});

test('suppress · 다른 코드의 경고는 건드리지 않는다', () => {
  const docs = [doc('shop', { kind: 'project', contains: ['capabilities/checkout'] }), doc('capabilities/checkout', { kind: 'capability' })];
  const issuesBySlug = new Map([
    [
      'capabilities/checkout',
      [
        { code: 'missing-expected-field', severity: 'warning', message: '`domain:` 가 비어있습니다: …' },
        { code: 'dangling-graph-reference', severity: 'warning', message: '없는 노드를 가리킵니다' },
      ],
    ],
  ]);
  suppressParentedExpectedFieldIssues(issuesBySlug, docs);
  assert.deepEqual(
    issuesBySlug.get('capabilities/checkout').map((i) => i.code),
    ['dangling-graph-reference'],
  );
});

test('suppress · domain 이 아닌 expected 필드 경고는 포함으로 지워지지 않는다', () => {
  // 포함이 세워 주는 것은 **부모**뿐이다. 다른 기대 필드는 그 논리가 닿지 않는다.
  const docs = [doc('shop', { kind: 'project', contains: ['capabilities/checkout'] }), doc('capabilities/checkout', { kind: 'capability' })];
  const issuesBySlug = new Map([
    [
      'capabilities/checkout',
      [{ code: 'missing-expected-field', severity: 'warning', message: '`path:` 가 비어있습니다: …' }],
    ],
  ]);
  suppressParentedExpectedFieldIssues(issuesBySlug, docs);
  assert.equal(issuesBySlug.get('capabilities/checkout').length, 1);
});
