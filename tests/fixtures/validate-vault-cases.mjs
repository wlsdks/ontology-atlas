// R11 #27 — vault validator contract fixture. src/shared/lib/validate-vault-
// document.ts (런타임 + UI) 와 mcp/src/validate.mjs (AI agent) 가 같은
// raw 입력에 대해 같은 issue codes set 반환 보장. 한 쪽 추가/변경 시 contract
// test 가 즉시 차단.
//
// fixture shape:
//   { name, input, expectedCodes: string[], expectedOk: boolean }
// expectedCodes 는 *severity 무관 set 비교* — 각 구현이 같은 set 을 반환하면 OK.

export const VALIDATE_CASES = [
  {
    name: 'frontmatter 없는 docs 파일 — clean',
    input: '# just a doc\n\nbody only.',
    expectedCodes: [],
    expectedOk: true,
  },
  {
    name: 'canonical kind = project — clean',
    input: '---\nuid: 01890f3e-7b5d-4c0a-8f14-123456789abc\nkind: project\ntitle: Foo\n---\nbody',
    expectedCodes: [],
    expectedOk: true,
  },
  {
    // R14 — capability/element 는 domain 없으면 missing-expected-field warning.
    // domain 까지 채운 경우가 'clean' baseline.
    name: 'canonical kind = capability — clean (with domain)',
    input: '---\nuid: 01890f3e-7b5d-4c0a-8f14-123456789abd\nkind: capability\ntitle: Cap\ndomain: domains/auth\n---\n',
    expectedCodes: [],
    expectedOk: true,
  },
  {
    name: 'capability without domain → missing-expected-field warning',
    input: '---\nuid: 01890f3e-7b5d-4c0a-8f14-123456789abe\nkind: capability\ntitle: Cap\n---\n',
    expectedCodes: ['missing-expected-field'],
    expectedOk: true,
  },
  {
    name: 'canonical kind without uid → missing-uid (error, ok=false)',
    input: '---\nkind: project\ntitle: Foo\n---\nbody',
    expectedCodes: ['missing-uid'],
    expectedOk: false,
  },
  {
    name: 'canonical kind with malformed uid → invalid-uid (error, ok=false)',
    input: '---\nuid: node-12\nkind: project\ntitle: Foo\n---\nbody',
    expectedCodes: ['invalid-uid'],
    expectedOk: false,
  },
  {
    name: 'merged_uids contains malformed identity → invalid-merged-uids',
    input: '---\nuid: 01890f3e-7b5d-4c0a-8f14-123456789abc\nmerged_uids: [node-12]\nkind: project\ntitle: Foo\n---\nbody',
    expectedCodes: ['invalid-merged-uids'],
    expectedOk: false,
  },
  {
    name: 'merged_uids cannot repeat the surviving uid',
    input: '---\nuid: 01890f3e-7b5d-4c0a-8f14-123456789abc\nmerged_uids: [01890f3e-7b5d-4c0a-8f14-123456789abc]\nkind: project\ntitle: Foo\n---\nbody',
    expectedCodes: ['invalid-merged-uids'],
    expectedOk: false,
  },
  {
    name: 'merged_uids must be canonical sorted unique UUIDv4 values',
    input: '---\nuid: 01890f3e-7b5d-4c0a-8f14-123456789abc\nmerged_uids: [21890f3e-7b5d-4c0a-8f14-123456789abc, 11890f3e-7b5d-4c0a-8f14-123456789abc, 21890f3e-7b5d-4c0a-8f14-123456789abc]\nkind: project\ntitle: Foo\n---\nbody',
    expectedCodes: ['non-canonical-merged-uids'],
    expectedOk: true,
  },
  {
    name: '닫는 --- 빠짐 → unclosed-frontmatter (error, ok=false)',
    input: '---\nkind: project\ntitle: Foo\n# unclosed',
    expectedCodes: ['unclosed-frontmatter'],
    expectedOk: false,
  },
  {
    name: '빈 kind 값 → empty-kind (error, ok=false)',
    input: '---\nkind:\nslug: foo\n---\n',
    expectedCodes: ['empty-kind'],
    expectedOk: false,
  },
  {
    name: 'frontmatter 있는데 kind 자체 없음 → missing-kind (warning, ok=true)',
    input: '---\nslug: foo\ntitle: Foo\n---\n',
    expectedCodes: ['missing-kind'],
    expectedOk: true,
  },
  {
    name: 'unknown kind value → unknown-kind (warning, ok=true)',
    input: '---\nuid: 21890f3e-7b5d-4c0a-8f14-123456789abc\nkind: bogus\ntitle: Foo\n---\n',
    expectedCodes: ['unknown-kind'],
    expectedOk: true,
  },
  {
    name: 'frontmatter 블록은 있는데 키 0 → parse-zero-keys (warning, ok=true)',
    input: '---\n: bad\n# comment\n---\n',
    expectedCodes: ['parse-zero-keys'],
    expectedOk: true,
  },
  {
    name: '콜론 없는 frontmatter 선언 → malformed-frontmatter-line (error, ok=false)',
    input: '---\nuid: 01890f3e-7b5d-4c0a-8f14-123456789abc\nkind: capability\ndomain: domains/probe\nelements\n  - elements/orphan\n---\n',
    expectedCodes: ['malformed-frontmatter-line', 'malformed-frontmatter-line'],
    expectedOk: false,
  },
  {
    name: '들여쓴 콜론 없는 frontmatter 선언 → malformed-frontmatter-line (error, ok=false)',
    input: '---\nuid: 01890f3e-7b5d-4c0a-8f14-123456789abc\nkind: capability\ndomain: domains/probe\n  missing-colon\n  orphan value\n---\n',
    expectedCodes: ['malformed-frontmatter-line', 'malformed-frontmatter-line'],
    expectedOk: false,
  },
  {
    name: 'graph 배열 중복/비정렬 → non-canonical-graph-array warning',
    input: '---\nuid: 11890f3e-7b5d-4c0a-8f14-123456789abc\nkind: project\ntitle: Foo\ndependencies: [z, a, z]\n---\n',
    expectedCodes: ['non-canonical-graph-array'],
    expectedOk: true,
  },
  {
    // 감사 2026-07-25 — `broader`(is_a / SKOS, 공방과 함께 도입)가 MCP 검증기
    // 에만 있고 scripts/웹/CLI 3곳의 `GRAPH_ARRAY_KEYS` 에서 빠져 있었다. 그
    // 리스트는 `non-canonical-graph-array` 와 `dangling-graph-reference` 를
    // **동시에** 구동하므로, 누락은 곧 "에이전트가 `broader:` 에 오타 슬러그를
    // 써도 CI 는 green" 을 뜻했다(웹 derive 는 미해석 ref 를 새 노드로 민팅 —
    // `derive-ontology-from-vault.ts` 의 팬텀 사고와 같은 부류).
    //
    // 이 fixture 가 그 drift 를 3-way 로 고정한다: 다시 한 쪽만 키를 추가하면
    // 즉시 빨개진다.
    name: 'broader 배열도 canonical 검사를 받는다 (검증기 3-way drift 차단)',
    // `kind: project` — capability 로 쓰면 `missing-expected-field`(domain 없음)가
    // 함께 붙어 이 fixture 가 검사하려는 계약이 흐려진다. 옆 fixture 와 동일 조건.
    input: '---\nuid: 11890f3e-7b5d-4c0a-8f14-123456789abd\nkind: project\ntitle: Foo\nbroader: [z, a, z]\n---\n',
    expectedCodes: ['non-canonical-graph-array'],
    expectedOk: true,
  },
];
