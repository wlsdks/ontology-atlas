// R11 #27 — vault validator contract fixture. src/shared/lib/validate-vault-
// Guarantees document.ts (runtime + UI) and mcp/src/validate.mjs (the AI agent
// surface) return the same issue-code set for the same raw input. Adding or changing a
// code on either side is blocked immediately by the contract test.
//
// fixture shape:
//   { name, input, expectedCodes: string[], expectedOk: boolean }
// expectedCodes is a *severity-independent set comparison* — each implementation
// returning the same set is a pass.

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
    // R14 — a capability or element with no domain produces a missing-expected-field
    // warning. Filling in the domain too is the 'clean' baseline.
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
    name: 'reviewed architecture profile is a clean non-graph document',
    input: '---\narchitecture_schema: architecture-profile/v1\nprofile_uid: 11890f3e-7b5d-4c0a-8f14-123456789abc\nproject_uid: 21890f3e-7b5d-4c0a-8f14-123456789abc\ntitle: Web architecture\n---\n',
    expectedCodes: [],
    expectedOk: true,
  },
  {
    name: 'unknown architecture profile contract does not bypass missing-kind',
    input: '---\narchitecture_schema: architecture-profile/v0\ntitle: Stale architecture\n---\n',
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
    name: '키 없이 malformed frontmatter만 있으면 parser diagnostics가 error를 유지',
    input: '---\nmalformed declaration\n---\n',
    expectedCodes: ['malformed-frontmatter-line', 'parse-zero-keys'],
    expectedOk: false,
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
    // Audit 2026-07-25 — `broader` (is_a / SKOS) existed only in the MCP validator and
    // was missing from `GRAPH_ARRAY_KEYS` in all three of scripts, web, and CLI. That list
    // drives **both** `non-canonical-graph-array` and `dangling-graph-reference`, so the
    // omission meant "an agent can write a typo'd slug in `broader:` and CI stays green"
    // (the web deriver mints unresolved refs as new nodes — the same class as the phantom
    // accident in `derive-ontology-from-vault.ts`).
    //
    // This fixture pins that drift three ways: adding the key on one side alone turns red
    // immediately.
    name: 'broader 배열도 canonical 검사를 받는다 (검증기 3-way drift 차단)',
    // `kind: project` — using capability here would also attach `missing-expected-field`
    // (no domain) and blur the contract this fixture checks. Same condition as the
    // adjacent fixture.
    input: '---\nuid: 11890f3e-7b5d-4c0a-8f14-123456789abd\nkind: project\ntitle: Foo\nbroader: [z, a, z]\n---\n',
    expectedCodes: ['non-canonical-graph-array'],
    expectedOk: true,
  },
  {
    // Regression fixture — the exact line that stood in
    // `docs/ontology/elements/agents-destination.md` while `vault:validate`
    // reported "0 issues" (2026-08-31). The value renders with a stray quote,
    // so this is an error: the document is readable but says the wrong thing.
    name: 'quoted scalar closing early → malformed-quoted-scalar (error, ok=false)',
    input:
      '---\nuid: 981cd7f6-506a-4b2b-b62c-cd56896e81b0\nkind: element\ndomain: domains/agent-integration\ntitle: Agents Destination\ndisplay_ko: "에이전트" 목적지\n---\n',
    expectedCodes: ['malformed-quoted-scalar'],
    expectedOk: false,
  },
];
